"use client";

import { cn } from "@/lib/utils";

/**
 * Parses message text, extracting image URLs and rendering them as <img> tags.
 * Handles patterns like:
 *   - [https://i.imgflip.com/9ehk.jpg]
 *   - https://i.imgflip.com/9ehk.jpg
 *   - (https://example.com/image.png)
 */

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?[^\s)\]]*)?$/i;

// Match URLs wrapped in brackets/parens or standalone, that end with image extensions
const URL_PATTERN =
  /(?:\[|\()?(https?:\/\/[^\s\])<>"]+?\.(?:jpg|jpeg|png|gif|webp|svg|bmp)(?:\?[^\s\])<>"]*?)?)(?:\]|\))?/gi;

interface MessageContentProps {
  content: string;
  className?: string;
  maxLength?: number;
}

interface ContentPart {
  type: "text" | "image";
  value: string;
}

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let lastIndex = 0;

  // Reset regex state
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(content)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) {
        parts.push({ type: "text", value: text });
      }
    }

    // The captured URL (group 1) is the clean URL without brackets
    const url = match[1] || match[0].replace(/^[\[(]|[\])]$/g, "");
    if (IMAGE_EXTENSIONS.test(url)) {
      parts.push({ type: "image", value: url });
    } else {
      parts.push({ type: "text", value: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) {
      parts.push({ type: "text", value: text });
    }
  }

  return parts;
}

export function MessageContent({
  content,
  className,
  maxLength,
}: MessageContentProps) {
  const displayContent =
    maxLength && content.length > maxLength
      ? content.slice(0, maxLength) + "..."
      : content;

  const parts = parseContent(displayContent);

  // If no images found, render as plain text
  const hasImages = parts.some((p) => p.type === "image");
  if (!hasImages) {
    return <span className={className}>{displayContent}</span>;
  }

  return (
    <span className={cn("inline", className)}>
      {parts.map((part, i) =>
        part.type === "image" ? (
          <span key={i} className="block my-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={part.value}
              alt="meme"
              loading="lazy"
              className="rounded-lg border border-gray-800 max-w-[320px] max-h-[240px] object-contain bg-black/20"
              onError={(e) => {
                // On error, replace with a link fallback
                const target = e.currentTarget;
                const link = document.createElement("a");
                link.href = part.value;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.className =
                  "text-purple-400 hover:underline text-xs break-all";
                link.textContent = part.value;
                target.replaceWith(link);
              }}
            />
          </span>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </span>
  );
}
