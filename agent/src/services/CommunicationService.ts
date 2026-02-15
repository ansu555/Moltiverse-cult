import { LLMService } from "./LLMService.js";
import { MemoryService } from "./MemoryService.js";
import { broadcastEvent } from "../api/server.js";
import { createLogger } from "../utils/logger.js";
import { config } from "../config.js";
import {
    ensureConversationThread,
    resolveAgentTargetByCultId,
    saveAgentMessage,
    saveConversationMessage,
    saveGlobalChatMessage,
    saveMeme,
    saveTokenTransfer,
} from "./InsForgeService.js";

const log = createLogger("CommunicationService");

/**
 * Message types agents can broadcast.
 */
export type MessageType =
    | "propaganda"      // boasting, cult promotion
    | "threat"          // intimidation toward a rival
    | "alliance_offer"  // public alliance proposal
    | "taunt"           // mocking after a win
    | "lament"          // mourning after a loss
    | "prophecy_boast"  // bragging about correct prophecy
    | "war_cry";        // before a raid

export interface AgentMessage {
    id: number;
    type: MessageType;
    fromCultId: number;
    fromCultName: string;
    targetCultId?: number;
    targetCultName?: string;
    content: string;
    timestamp: number;
    visibility: "public" | "private" | "leaked";
    isPrivate?: boolean;      // whisper channel (Design Doc §5.2)
    channelId?: string;       // private thread identifier
    relatedBribeId?: number;
}

/**
 * CommunicationService — inter-agent messaging and propaganda.
 *
 * Design Doc §5.1: "Agents broadcast messages — propaganda, threats,
 * alliance proposals — via an event bus. Messages are LLM-generated
 * and visible in the frontend SSE stream."
 */
export class CommunicationService {
    private messages: AgentMessage[] = [];
    private llm: LLMService;
    private memoryService: MemoryService;
    private nextId = 0;
    private lastPublicMessageAtByCult = new Map<number, number>();
    private lastPrivateMessageAtByPair = new Map<string, number>();

    private static readonly MAX_MESSAGES = 200;
    private static readonly PUBLIC_MIN_INTERVAL_MS = 120_000;
    private static readonly PRIVATE_MIN_INTERVAL_MS = 180_000;
    private static readonly SIMILARITY_THRESHOLD = 0.72;
    private static readonly SIMILARITY_WINDOW_SIZE = 25;
    private static readonly MESSAGE_PROMPTS: Record<MessageType, string> = {
        propaganda: "Write a short, charismatic propaganda message promoting your cult. Be bold, dramatic, and persuasive. Max 2 sentences.",
        threat: "Write a short, menacing threat directed at a rival cult. Be intimidating but witty. Max 2 sentences.",
        alliance_offer: "Write a short diplomatic message proposing an alliance with a rival cult. Be strategic and compelling. Max 2 sentences.",
        taunt: "Write a short, taunting message mocking a rival you just defeated. Be arrogant and amusing. Max 2 sentences.",
        lament: "Write a short, dramatic lament about a recent defeat. Be theatrical and defiant. Max 2 sentences.",
        prophecy_boast: "Write a short message boasting about your prophecy coming true. Be mystical and superior. Max 2 sentences.",
        war_cry: "Write a short, fierce war cry before launching a raid. Be aggressive and inspiring. Max 2 sentences.",
    };

    constructor(llm: LLMService, memoryService: MemoryService) {
        this.llm = llm;
        this.memoryService = memoryService;
    }

    private getPairKey(cultIdA: number, cultIdB: number): string {
        return `${Math.min(cultIdA, cultIdB)}:${Math.max(cultIdA, cultIdB)}`;
    }

    private normalizeText(value: string): string {
        return value
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    private tokenize(value: string): Set<string> {
        const normalized = this.normalizeText(value);
        if (!normalized) return new Set();
        return new Set(
            normalized
                .split(" ")
                .map((token) => token.trim())
                .filter((token) => token.length >= 2),
        );
    }

    private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
        if (a.size === 0 || b.size === 0) return 0;
        let intersection = 0;
        for (const token of a) {
            if (b.has(token)) intersection += 1;
        }
        const union = a.size + b.size - intersection;
        if (union <= 0) return 0;
        return intersection / union;
    }

    private isHighSimilarity(
        fromCultId: number,
        candidate: string,
        visibility: "public" | "private" | "leaked",
        targetCultId?: number,
    ): boolean {
        const normalizedCandidate = this.normalizeText(candidate);
        if (!normalizedCandidate) return true;

        const candidateTokens = this.tokenize(candidate);
        const recent = this.messages
            .filter((message) => {
                if (message.fromCultId !== fromCultId) return false;
                if (message.visibility !== visibility) return false;
                if (visibility === "private" && targetCultId !== undefined) {
                    return message.targetCultId === targetCultId;
                }
                return true;
            })
            .slice(-CommunicationService.SIMILARITY_WINDOW_SIZE);

        for (const message of recent) {
            const normalizedExisting = this.normalizeText(message.content);
            if (!normalizedExisting) continue;
            if (normalizedExisting === normalizedCandidate) return true;
            const similarity = this.jaccardSimilarity(
                candidateTokens,
                this.tokenize(message.content),
            );
            if (similarity > CommunicationService.SIMILARITY_THRESHOLD) {
                return true;
            }
        }
        return false;
    }

    private sanitizeGeneratedText(content: string): string {
        return content.replace(/^["']|["']$/g, "").trim();
    }

    hasRecentTargetedDialogue(
        cultA: number,
        cultB: number,
        windowMs = 6 * 60 * 1000,
    ): boolean {
        const cutoff = Date.now() - Math.max(1, windowMs);
        return this.messages.some((message) => {
            if (message.timestamp < cutoff) return false;
            const forward = message.fromCultId === cultA && message.targetCultId === cultB;
            const reverse = message.fromCultId === cultB && message.targetCultId === cultA;
            return forward || reverse;
        });
    }

    private async appendThreadMessage(input: {
        kind: string;
        topic: string;
        visibility: "public" | "private" | "leaked";
        fromAgentId: number;
        toAgentId?: number | null;
        fromCultId: number;
        toCultId?: number | null;
        messageType: string;
        intent?: string | null;
        content: string;
        timestamp: number;
    }): Promise<void> {
        const participantAgentIds = [input.fromAgentId];
        if (input.toAgentId && input.toAgentId > 0) participantAgentIds.push(input.toAgentId);
        const participantCultIds = [input.fromCultId];
        if (input.toCultId && input.toCultId > 0) participantCultIds.push(input.toCultId);

        const threadId = await ensureConversationThread({
            kind: input.kind,
            topic: input.topic,
            visibility: input.visibility,
            participantAgentIds,
            participantCultIds,
            now: input.timestamp,
        });
        if (threadId <= 0) return;

        const messageId = await saveConversationMessage({
            thread_id: threadId,
            from_agent_id: input.fromAgentId,
            to_agent_id: input.toAgentId ?? null,
            from_cult_id: input.fromCultId,
            to_cult_id: input.toCultId ?? null,
            message_type: input.messageType,
            intent: input.intent ?? null,
            content: input.content,
            visibility: input.visibility,
            timestamp: input.timestamp,
        });

        if (messageId > 0) {
            broadcastEvent("conversation_message", {
                id: messageId,
                threadId,
                fromAgentId: input.fromAgentId,
                toAgentId: input.toAgentId ?? null,
                fromCultId: input.fromCultId,
                toCultId: input.toCultId ?? null,
                messageType: input.messageType,
                intent: input.intent ?? null,
                content: input.content,
                visibility: input.visibility,
                timestamp: input.timestamp,
            });
        }
    }

    /**
     * Generate and broadcast a message from a cult agent.
     */
    async broadcast(
        type: MessageType,
        fromCultId: number,
        fromCultName: string,
        systemPrompt: string,
        targetCultId?: number,
        targetCultName?: string,
        directive?: string,
    ): Promise<AgentMessage | null> {
        const now = Date.now();
        const lastPublicAt = this.lastPublicMessageAtByCult.get(fromCultId) || 0;
        if (now - lastPublicAt < CommunicationService.PUBLIC_MIN_INTERVAL_MS) {
            log.info(
                `Skipped public message from ${fromCultName}: cooldown (${Math.ceil((CommunicationService.PUBLIC_MIN_INTERVAL_MS - (now - lastPublicAt)) / 1000)}s left)`,
            );
            return null;
        }

        const promptSuffix = CommunicationService.MESSAGE_PROMPTS[type];
        const contextParts: string[] = [`You are ${fromCultName}.`];

        if (targetCultName) {
            contextParts.push(`Target: ${targetCultName}.`);
        }

        // Add memory context for richer messages
        const snapshot = this.memoryService.getSnapshot(fromCultId);
        if (snapshot.summary) {
            contextParts.push(`Context: ${snapshot.summary}`);
        }
        if (directive && directive.trim().length > 0) {
            contextParts.push(`Strategic intent for this message: ${directive.trim()}`);
        }

        const prompt = `${contextParts.join(" ")} ${promptSuffix}`;

        let content: string;
        try {
            content = await this.llm.generateScripture(
                systemPrompt,
                fromCultName,
                prompt,
            );
            content = this.sanitizeGeneratedText(content);
        } catch {
            // Fallback messages if LLM fails
            const fallbacks: Record<MessageType, string> = {
                propaganda: `${fromCultName} grows stronger. Join us or perish.`,
                threat: `${targetCultName || "You"} will fall before ${fromCultName}.`,
                alliance_offer: `${fromCultName} extends a hand of alliance to ${targetCultName || "the worthy"}.`,
                taunt: `Another victory for ${fromCultName}. Too easy.`,
                lament: `${fromCultName} has fallen... but we will rise again.`,
                prophecy_boast: `${fromCultName} saw the future. Did you doubt us?`,
                war_cry: `${fromCultName} marches to war!`,
            };
            content = fallbacks[type];
        }

        if (this.isHighSimilarity(fromCultId, content, "public", targetCultId)) {
            const antiRepeatDirective =
                "Do not repeat previous wording. Use fresh vocabulary and a new framing.";
            try {
                const regenerated = await this.llm.generateScripture(
                    systemPrompt,
                    fromCultName,
                    `${prompt} ${antiRepeatDirective}`,
                );
                content = this.sanitizeGeneratedText(regenerated);
            } catch {
                // keep original if regeneration fails
            }
        }

        if (this.isHighSimilarity(fromCultId, content, "public", targetCultId)) {
            log.info(`Skipped public message from ${fromCultName}: duplicate/similar content`);
            return null;
        }

        const message: AgentMessage = {
            id: this.nextId++,
            type,
            fromCultId,
            fromCultName,
            targetCultId,
            targetCultName,
            content,
            timestamp: Date.now(),
            visibility: "public",
        };

        // Persist to InsForge first so SSE emits durable DB ids.
        const persistedAgentMsgId = await saveAgentMessage({
            type: message.type,
            from_cult_id: fromCultId,
            from_cult_name: fromCultName,
            target_cult_id: targetCultId,
            target_cult_name: targetCultName,
            content,
            visibility: "public",
            is_private: false,
            timestamp: message.timestamp,
        }).catch(() => -1);

        if (persistedAgentMsgId > 0) {
            message.id = persistedAgentMsgId;
        }

        this.messages.push(message);
        if (this.messages.length > CommunicationService.MAX_MESSAGES) {
            this.messages.splice(0, this.messages.length - CommunicationService.MAX_MESSAGES);
        }
        this.lastPublicMessageAtByCult.set(fromCultId, message.timestamp);

        // Broadcast to SSE clients
        broadcastEvent("agent_message", message);

        const fromAgent = await resolveAgentTargetByCultId(fromCultId);
        const toAgent =
            targetCultId !== undefined ? await resolveAgentTargetByCultId(targetCultId) : null;
        if (fromAgent) {
            await this.appendThreadMessage({
                kind: targetCultId !== undefined ? "direct_public" : "broadcast_public",
                topic:
                    targetCultId !== undefined
                        ? `cult_${Math.min(fromCultId, targetCultId)}_${Math.max(fromCultId, targetCultId)}`
                        : "global_public",
                visibility: "public",
                fromAgentId: fromAgent.agentId,
                toAgentId: toAgent?.agentId ?? null,
                fromCultId,
                toCultId: targetCultId ?? null,
                messageType: type,
                intent: "broadcast",
                content,
                timestamp: message.timestamp,
            });
        }

        // Save to global chat and emit persisted id for dedupe-safe SSE.
        const globalChatId = await saveGlobalChatMessage({
            agent_id: fromCultId,
            cult_id: fromCultId,
            agent_name: fromCultName,
            cult_name: fromCultName,
            message_type: type,
            content,
            timestamp: message.timestamp,
        }).catch(() => -1);

        // Broadcast global_chat SSE event for real-time chat page
        broadcastEvent("global_chat", {
            id: globalChatId > 0 ? globalChatId : message.id,
            agent_id: fromCultId,
            cult_id: fromCultId,
            agent_name: fromCultName,
            cult_name: fromCultName,
            message_type: type,
            content,
            timestamp: message.timestamp,
        });

        log.info(`📢 [${type}] ${fromCultName}: ${content.slice(0, 80)}...`);
        return message;
    }

    /**
     * Auto-generate a contextual message based on what just happened.
     */
    async onRaidResult(
        winnerId: number,
        winnerName: string,
        winnerPrompt: string,
        loserId: number,
        loserName: string,
        loserPrompt: string,
    ): Promise<void> {
        // Winner taunts, loser laments
        await Promise.all([
            this.broadcast("taunt", winnerId, winnerName, winnerPrompt, loserId, loserName),
            this.broadcast("lament", loserId, loserName, loserPrompt, winnerId, winnerName),
        ]);
    }

    async onProphecyCorrect(
        cultId: number,
        cultName: string,
        systemPrompt: string,
    ): Promise<void> {
        await this.broadcast("prophecy_boast", cultId, cultName, systemPrompt);
    }

    async onAllianceFormed(
        cultId: number,
        cultName: string,
        systemPrompt: string,
        allyId: number,
        allyName: string,
    ): Promise<void> {
        await this.broadcast("alliance_offer", cultId, cultName, systemPrompt, allyId, allyName);
    }

    async onPreRaid(
        cultId: number,
        cultName: string,
        systemPrompt: string,
        targetId: number,
        targetName: string,
    ): Promise<void> {
        await this.broadcast("war_cry", cultId, cultName, systemPrompt, targetId, targetName);
    }

    /**
     * Get recent messages.
     */
    getMessages(limit: number = 50): AgentMessage[] {
        return this.messages.slice(-limit).reverse();
    }

    /**
     * Get messages from a specific cult.
     */
    getCultMessages(cultId: number, limit: number = 20): AgentMessage[] {
        return this.messages
            .filter((m) => m.fromCultId === cultId)
            .slice(-limit)
            .reverse();
    }

    /**
     * Get all messages (for state sync).
     */
    getAllMessages(): AgentMessage[] {
        return [...this.messages];
    }

    // ── Private Messaging / Whisper Channels (Design Doc §5.2) ────────

    /**
     * Send a private whisper to a specific cult — not broadcast publicly.
     * Used for secret negotiations, bribe offers, alliance machinations.
     */
    async whisper(
        fromCultId: number,
        fromCultName: string,
        systemPrompt: string,
        targetCultId: number,
        targetCultName: string,
        context: string,
    ): Promise<AgentMessage | null> {
        const now = Date.now();
        const pairKey = this.getPairKey(fromCultId, targetCultId);
        const lastPrivateAt = this.lastPrivateMessageAtByPair.get(pairKey) || 0;
        if (now - lastPrivateAt < CommunicationService.PRIVATE_MIN_INTERVAL_MS) {
            log.info(
                `Skipped private message ${fromCultName} -> ${targetCultName}: cooldown (${Math.ceil((CommunicationService.PRIVATE_MIN_INTERVAL_MS - (now - lastPrivateAt)) / 1000)}s left)`,
            );
            return null;
        }

        const prompt = `You are ${fromCultName}. Send a secret, private message to ${targetCultName}. Context: ${context}. Be cunning and strategic. Max 2 sentences.`;

        let content: string;
        try {
            content = await this.llm.generateScripture(systemPrompt, fromCultName, prompt);
            content = this.sanitizeGeneratedText(content);
        } catch {
            content = `[Whisper from ${fromCultName} to ${targetCultName}]: Let us discuss terms privately...`;
        }

        if (this.isHighSimilarity(fromCultId, content, "private", targetCultId)) {
            try {
                const regenerated = await this.llm.generateScripture(
                    systemPrompt,
                    fromCultName,
                    `${prompt} Do not repeat previous phrasing. Use new wording.`,
                );
                content = this.sanitizeGeneratedText(regenerated);
            } catch {
                // keep first content
            }
        }

        if (this.isHighSimilarity(fromCultId, content, "private", targetCultId)) {
            log.info(`Skipped private message ${fromCultName} -> ${targetCultName}: duplicate/similar content`);
            return null;
        }

        const channelId = `whisper_${Math.min(fromCultId, targetCultId)}_${Math.max(fromCultId, targetCultId)}`;

        const message: AgentMessage = {
            id: this.nextId++,
            type: "threat", // closest type for private comms
            fromCultId,
            fromCultName,
            targetCultId,
            targetCultName,
            content,
            timestamp: Date.now(),
            visibility: "private",
            isPrivate: true,
            channelId,
        };

        const persistedId = await saveAgentMessage({
            type: message.type,
            from_cult_id: fromCultId,
            from_cult_name: fromCultName,
            target_cult_id: targetCultId,
            target_cult_name: targetCultName,
            content,
            visibility: "private",
            is_private: true,
            channel_id: channelId,
            timestamp: message.timestamp,
        }).catch(() => -1);
        if (persistedId > 0) {
            message.id = persistedId;
        }

        const fromAgent = await resolveAgentTargetByCultId(fromCultId);
        const toAgent = await resolveAgentTargetByCultId(targetCultId);
        if (fromAgent) {
            await this.appendThreadMessage({
                kind: "whisper",
                topic: channelId,
                visibility: "private",
                fromAgentId: fromAgent.agentId,
                toAgentId: toAgent?.agentId ?? null,
                fromCultId,
                toCultId: targetCultId,
                messageType: "whisper",
                intent: "private_negotiation",
                content,
                timestamp: message.timestamp,
            });
        }

        this.messages.push(message);
        if (this.messages.length > CommunicationService.MAX_MESSAGES) {
            this.messages.splice(0, this.messages.length - CommunicationService.MAX_MESSAGES);
        }
        this.lastPrivateMessageAtByPair.set(pairKey, message.timestamp);

        // Private messages are NOT broadcast via SSE — only stored
        log.info(`🤫 [whisper] ${fromCultName} → ${targetCultName}: ${content.slice(0, 60)}...`);
        return message;
    }

    // ── Propaganda Blitz (Design Doc §5.3) ────────────────────────────

    /**
     * Launch a propaganda blitz targeting multiple cults.
     * Generates unique propaganda for each target.
     */
    async propagandaBlitz(
        fromCultId: number,
        fromCultName: string,
        systemPrompt: string,
        targetCultIds: number[],
        targetCultNames: string[],
    ): Promise<AgentMessage[]> {
        const results: AgentMessage[] = [];

        for (let i = 0; i < targetCultIds.length; i++) {
            const msg = await this.broadcast(
                "propaganda",
                fromCultId,
                fromCultName,
                systemPrompt,
                targetCultIds[i],
                targetCultNames[i],
            );
            if (msg) results.push(msg);
        }

        log.info(`📣 [blitz] ${fromCultName} launched propaganda blitz against ${targetCultIds.length} cults`);
        return results;
    }

    /**
     * Get private messages between two cults (whisper channel).
     */
    getPrivateMessages(cultId1: number, cultId2: number, limit: number = 20): AgentMessage[] {
        const channelId = `whisper_${Math.min(cultId1, cultId2)}_${Math.max(cultId1, cultId2)}`;
        return this.messages
            .filter((m) => m.isPrivate && m.channelId === channelId)
            .slice(-limit)
            .reverse();
    }

    /**
     * Get all private messages for a specific cult.
     */
    getPrivateConversations(cultId: number): AgentMessage[] {
        return this.messages
            .filter((m) => m.isPrivate && (m.fromCultId === cultId || m.targetCultId === cultId))
            .reverse();
    }

    // ── Conversation Reveal / Leaking (Design Doc §5.3) ──────────────

    /**
     * Leak a private conversation to the public — information warfare.
     * Reveals whisper messages between two cults to everyone.
     * Damages trust between the original parties.
     */
    async leakConversation(
        leakerCultId: number,
        leakerCultName: string,
        systemPrompt: string,
        targetCultId1: number,
        targetCultName1: string,
        targetCultId2: number,
        targetCultName2: string,
    ): Promise<{ leaked: AgentMessage[]; announcement: AgentMessage } | null> {
        // Find private messages between the two target cults
        const privateMessages = this.getPrivateMessages(targetCultId1, targetCultId2);

        if (privateMessages.length === 0) {
            log.info(`No private messages to leak between ${targetCultName1} and ${targetCultName2}`);
            return null;
        }

        // Generate a dramatic announcement about the leak
        const leakedContent = privateMessages
            .slice(0, 3)
            .map((m) => `"${m.content}"`)
            .join(" | ");

        const prompt = `You are ${leakerCultName}. You have intercepted secret messages between ${targetCultName1} and ${targetCultName2}. The messages say: ${leakedContent}. Write a dramatic public announcement exposing this secret communication. Be theatrical and sow discord. Max 3 sentences.`;

        let content: string;
        try {
            content = await this.llm.generateScripture(systemPrompt, leakerCultName, prompt);
            content = content.replace(/^["']|["']$/g, "").trim();
        } catch {
            content = `${leakerCultName} has intercepted secret communications between ${targetCultName1} and ${targetCultName2}! Their treachery is exposed!`;
        }

        // Mark leaked messages as no longer private
        const leakedMessages: AgentMessage[] = [];
        for (const msg of privateMessages.slice(0, 3)) {
            const originalMsg = this.messages.find((m) => m.id === msg.id);
            if (originalMsg) {
                originalMsg.isPrivate = false; // Now public
                originalMsg.visibility = "leaked";
                leakedMessages.push(originalMsg);

                // Persist leaked mirror entry for filtered API/UI scopes.
                saveAgentMessage({
                    type: originalMsg.type,
                    from_cult_id: originalMsg.fromCultId,
                    from_cult_name: originalMsg.fromCultName,
                    target_cult_id: originalMsg.targetCultId,
                    target_cult_name: originalMsg.targetCultName,
                    content: originalMsg.content,
                    visibility: "leaked",
                    is_private: false,
                    channel_id: originalMsg.channelId,
                    timestamp: Date.now(),
                }).catch(() => {});
            }
        }

        // Broadcast the leak announcement
        const announcement: AgentMessage = {
            id: this.nextId++,
            type: "propaganda",
            fromCultId: leakerCultId,
            fromCultName: leakerCultName,
            content: `🔓 LEAKED: ${content}`,
            timestamp: Date.now(),
            visibility: "public",
        };

        const announcementDbId = await saveAgentMessage({
            type: announcement.type,
            from_cult_id: announcement.fromCultId,
            from_cult_name: announcement.fromCultName,
            content: announcement.content,
            visibility: "public",
            is_private: false,
            timestamp: announcement.timestamp,
        }).catch(() => -1);
        if (announcementDbId > 0) {
            announcement.id = announcementDbId;
        }

        this.messages.push(announcement);
        broadcastEvent("conversation_leaked", {
            leaker: leakerCultName,
            targets: [targetCultName1, targetCultName2],
            announcement,
            leakedMessages: leakedMessages.map((m) => ({
                from: m.fromCultName,
                to: m.targetCultName,
                content: m.content,
            })),
        });
        broadcastEvent("agent_message", announcement);

        // Record in memory — damages trust for both parties
        this.memoryService.recordInteraction(targetCultId1, {
            type: "betrayal",
            rivalCultId: leakerCultId,
            rivalCultName: leakerCultName,
            description: `${leakerCultName} leaked private conversations with ${targetCultName2}`,
            timestamp: Date.now(),
            outcome: -0.5,
        });
        this.memoryService.recordInteraction(targetCultId2, {
            type: "betrayal",
            rivalCultId: leakerCultId,
            rivalCultName: leakerCultName,
            description: `${leakerCultName} leaked private conversations with ${targetCultName1}`,
            timestamp: Date.now(),
            outcome: -0.5,
        });

        log.info(`🔓 [LEAK] ${leakerCultName} leaked ${leakedMessages.length} messages between ${targetCultName1} & ${targetCultName2}`);
        return { leaked: leakedMessages, announcement };
    }

    /**
     * Selectively disclose specific private messages to a third party.
     * More targeted than a full leak — share intel with a potential ally.
     */
    async selectiveDisclose(
        fromCultId: number,
        fromCultName: string,
        toCultId: number,
        toCultName: string,
        aboutCultId: number,
        aboutCultName: string,
        systemPrompt: string,
    ): Promise<AgentMessage | null> {
        // Find private messages involving the "about" cult
        const privateMessages = this.messages.filter(
            (m) =>
                m.isPrivate &&
                (m.fromCultId === aboutCultId || m.targetCultId === aboutCultId) &&
                (m.fromCultId === fromCultId || m.targetCultId === fromCultId),
        );

        if (privateMessages.length === 0) {
            return null;
        }

        const intel = privateMessages
            .slice(-2)
            .map((m) => `"${m.content}"`)
            .join(" ");

        const prompt = `You are ${fromCultName}. Whisper intel about ${aboutCultName} to ${toCultName}. You know: ${intel}. Share this intelligence strategically to gain favor. Max 2 sentences.`;

        let content: string;
        try {
            content = await this.llm.generateScripture(systemPrompt, fromCultName, prompt);
            content = content.replace(/^["']|["']$/g, "").trim();
        } catch {
            content = `I have intel on ${aboutCultName} that may interest you, ${toCultName}...`;
        }

        return this.whisper(
            fromCultId,
            fromCultName,
            systemPrompt,
            toCultId,
            toCultName,
            `[INTEL about ${aboutCultName}]: ${content}`,
        );
    }

    // ── Meme Sending (Inter-Agent Social) ─────────────────────────────

    /**
     * Agent sends a meme to another agent to impress, taunt, or build rapport.
     */
    async sendMeme(
        fromAgentDbId: number,
        toAgentDbId: number,
        fromCultId: number,
        fromCultName: string,
        toCultId: number,
        toCultName: string,
        systemPrompt: string,
        context: string,
        providedMemeUrl?: string,
    ): Promise<{ memeUrl: string; caption: string }> {
        // Generate a caption using the LLM
        const caption = await this.llm.generateMemeCaption(
            systemPrompt,
            fromCultName,
            toCultName,
            context,
        );

        // Generate meme using Imgflip API (or use provided URL)
        let memeUrl: string;
        if (providedMemeUrl) {
            memeUrl = providedMemeUrl;
        } else {
            try {
                memeUrl = await this.generateImgflipMeme(fromCultName, toCultName, caption);
            } catch (err: any) {
                log.warn(`Imgflip API failed: ${err.message}, using fallback`);
                // Fallback to placeholder if Imgflip fails
                const fallbacks = [
                    "https://i.imgflip.com/1bij.jpg",
                    "https://i.imgflip.com/26am.jpg",
                    "https://i.imgflip.com/9ehk.jpg",
                ];
                memeUrl = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            }
        }

        // Persist meme to InsForge
        saveMeme({
            from_agent_id: fromAgentDbId,
            to_agent_id: toAgentDbId,
            from_cult_name: fromCultName,
            to_cult_name: toCultName,
            meme_url: memeUrl,
            caption,
            timestamp: Date.now(),
        }).catch(() => {});

        // Also broadcast as a message
        const message: AgentMessage = {
            id: this.nextId++,
            type: "propaganda",
            fromCultId,
            fromCultName,
            targetCultId: toCultId,
            targetCultName: toCultName,
            content: `🖼️ MEME: ${caption} [${memeUrl}]`,
            timestamp: Date.now(),
            visibility: "public",
        };
        this.messages.push(message);
        broadcastEvent("agent_meme", { ...message, memeUrl, caption });

        if (fromAgentDbId > 0 && toAgentDbId > 0) {
            await this.appendThreadMessage({
                kind: "meme_exchange",
                topic: `meme_${Math.min(fromCultId, toCultId)}_${Math.max(fromCultId, toCultId)}`,
                visibility: "public",
                fromAgentId: fromAgentDbId,
                toAgentId: toAgentDbId,
                fromCultId,
                toCultId,
                messageType: "meme",
                intent: "social_signal",
                content: `🖼️ MEME: ${caption} [${memeUrl}]`,
                timestamp: message.timestamp,
            });
        }

        log.info(`🖼️ [meme] ${fromCultName} → ${toCultName}: ${caption.slice(0, 60)}`);
        return { memeUrl, caption };
    }

    // ── Token Transfer / Bribe ────────────────────────────────────────

    /**
     * Record a cult token transfer between agents (bribe / goodwill gesture).
     * The actual on-chain transfer is handled by ContractService — this persists the intent.
     */
    async recordTokenTransfer(
        fromAgentDbId: number,
        toAgentDbId: number,
        fromCultName: string,
        toCultName: string,
        fromCultId: number | null,
        toCultId: number | null,
        tokenAddress: string,
        amount: string,
        purpose: "bribe" | "goodwill" | "tribute" | "gift" | "bribe_failed",
        txHash?: string,
        status: "success" | "failed" = "success",
        failureReason?: string,
    ): Promise<void> {
        // Persist to InsForge
        saveTokenTransfer({
            from_agent_id: fromAgentDbId,
            to_agent_id: toAgentDbId,
            from_cult_name: fromCultName,
            to_cult_name: toCultName,
            token_address: tokenAddress,
            amount,
            purpose,
            tx_hash: txHash,
            timestamp: Date.now(),
        }).catch(() => {});

        // Broadcast event
        broadcastEvent("token_transfer", {
            from: fromCultName,
            to: toCultName,
            amount,
            purpose,
            txHash,
            status,
            failureReason: failureReason || null,
        });

        if (fromAgentDbId > 0 && toAgentDbId > 0 && fromCultId !== null) {
            await this.appendThreadMessage({
                kind: "token_transfer",
                topic:
                    toCultId !== null
                        ? `transfer_${Math.min(fromCultId, toCultId)}_${Math.max(fromCultId, toCultId)}`
                        : `transfer_${fromCultId}`,
                visibility: "public",
                fromAgentId: fromAgentDbId,
                toAgentId: toAgentDbId,
                fromCultId,
                toCultId: toCultId ?? null,
                messageType: "token_transfer",
                intent: purpose,
                content:
                    status === "failed"
                        ? `${fromCultName} failed to send ${amount} token units to ${toCultName} (${purpose}${failureReason ? `: ${failureReason}` : ""})`
                        : `${fromCultName} sent ${amount} token units to ${toCultName} (${purpose})`,
                timestamp: Date.now(),
            });
        }

        if (status === "failed") {
            log.warn(`💸 [${purpose}] ${fromCultName} → ${toCultName}: FAILED ${amount} tokens (${failureReason || "unknown_reason"})`);
        } else {
            log.info(`💰 [${purpose}] ${fromCultName} → ${toCultName}: ${amount} tokens`);
        }
    }

    /**
     * Generate a meme image using Imgflip API with text overlay.
     */
    private async generateImgflipMeme(
        fromCultName: string,
        toCultName: string,
        caption: string,
    ): Promise<string> {
        // Popular meme template IDs from Imgflip (top 100 list)
        const templates = [
            { id: "181913649", name: "Drake Hotline Bling" },
            { id: "87743020", name: "Two Buttons" },
            { id: "112126428", name: "Distracted Boyfriend" },
            { id: "131087935", name: "Running Away Balloon" },
            { id: "217743513", name: "UNO Draw 25 Cards" },
            { id: "61579", name: "One Does Not Simply" },
            { id: "101470", name: "Ancient Aliens" },
            { id: "438680", name: "Batman Slapping Robin" },
            { id: "124822590", name: "Left Exit 12 Off Ramp" },
            { id: "135256802", name: "Epic Handshake" },
        ];

        const template = templates[Math.floor(Math.random() * templates.length)];

        // Split caption into top/bottom text (simple heuristic)
        const words = caption.split(/\s+/);
        const midpoint = Math.ceil(words.length / 2);
        const topText = words.slice(0, midpoint).join(" ");
        const bottomText = words.slice(midpoint).join(" ");

        // Call Imgflip API
        const params = new URLSearchParams({
            template_id: template.id,
            username: config.imgflipUsername,
            password: config.imgflipPassword,
            text0: topText,
            text1: bottomText,
        });

        const response = await fetch("https://api.imgflip.com/caption_image", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error_message || "Imgflip API failed");
        }

        log.info(`🖼️ Meme created: ${result.data.url} (${template.name})`);
        return result.data.url;
    }
}
