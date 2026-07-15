"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"
import {
  BlockCaptionIcon,
  BlockFigureIcon,
  BlockHeadingIcon,
  BlockNumberIcon,
  BlockParagraphIcon,
  BlockTableIcon,
  BlockTitleIcon,
  ViewListIcon,
  type IconProps,
} from "@/components/icons"
import { ScrollArea } from "@/components/shadcn/scroll-area"

export type Point = {
  x: number
  y: number
}

export type BoundingBox = {
  left: number
  top: number
  right: number
  bottom: number
}

export type OcrBlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "figure"
  | "header"
  | "footer"
  | "page_number"

export type ParsedOcrBlock = {
  id: string
  type: string
  content: string
  metadata: {
    page: {
      number: number
      width: number
      height: number
    }
    layoutClass?: string
    minOcrConfidence?: number
    avgOcrConfidence?: number
  }
  polygon?: Point[]
  boundingBox?: BoundingBox
}

export type ParsedOcrOutput = {
  chunks: {
    blocks: ParsedOcrBlock[]
  }[]
}

export type OcrBlock = {
  id: string
  type: OcrBlockType
  text: string
  page: number
  pageWidth: number
  pageHeight: number
  confidence: number
  polygon?: Point[]
  boundingBox?: BoundingBox
}

export const PDF_URL = "/samples/attention-rotated.pdf"
const OCR_BLOCK_ROW_MIN_ESTIMATE = 92
const OCR_BLOCK_ROW_VERTICAL_CHROME = 62
const OCR_BLOCK_LINE_HEIGHT = 20
const OCR_BLOCK_ESTIMATED_CHARS_PER_LINE = 42
const OCR_BLOCK_ROW_GAP = 8
const OCR_BLOCK_LIST_PADDING = 12
const OCR_MARKDOWN_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    figure: [...(defaultSchema.attributes?.figure ?? []), "type"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "caption",
    "figcaption",
    "figure",
  ],
}
const OCR_MARKDOWN_REHYPE_PLUGINS: NonNullable<
  React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]
> = [rehypeRaw, [rehypeSanitize, OCR_MARKDOWN_SCHEMA]]
const OCR_MARKDOWN_REMARK_PLUGINS: NonNullable<
  React.ComponentProps<typeof ReactMarkdown>["remarkPlugins"]
> = [remarkGfm]
const OCR_MARKDOWN_FIGURE_CAPTION_PATTERN = /<\/?caption>/gi

function getEstimatedOcrBlockRowHeight(block: OcrBlock) {
  const plainText = block.text
    .replace(OCR_MARKDOWN_FIGURE_CAPTION_PATTERN, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const explicitLineCount = block.text.split(/\n+/).filter(Boolean).length
  const wrappedLineCount = Math.max(
    explicitLineCount,
    Math.ceil(plainText.length / OCR_BLOCK_ESTIMATED_CHARS_PER_LINE)
  )
  const contentHeight = Math.max(1, wrappedLineCount) * OCR_BLOCK_LINE_HEIGHT
  const typeExtraHeight =
    block.type === "figure" ? 44 : block.type === "table" ? 28 : 0

  return Math.max(
    OCR_BLOCK_ROW_MIN_ESTIMATE,
    OCR_BLOCK_ROW_VERTICAL_CHROME +
      contentHeight +
      typeExtraHeight +
      OCR_BLOCK_ROW_GAP
  )
}

// PAPERS-FORK: the upstream component ships a ~250KB demo dataset
// (ATTENTION_OCR_OUTPUT, the "Attention Is All You Need" sample) here.
// We stripped it — real data comes from GET /papers/{id}/layout. If this
// file is ever re-pulled from the @extend registry, strip it again.
export const ATTENTION_OCR_OUTPUT = {
  chunks: [],
} satisfies ParsedOcrOutput

const BLOCK_STYLES: Record<
  OcrBlockType,
  {
    label: string
    icon: React.ComponentType<IconProps>
    overlay: string
    mutedOverlay: string
    ring: string
    badge: string
  }
> = {
  heading: {
    label: "Heading",
    icon: BlockHeadingIcon,
    overlay: "border-violet-500/70 bg-violet-500/10",
    mutedOverlay: "border-violet-500/35 bg-violet-500/5",
    ring: "border-violet-500/60 bg-violet-500/5 text-violet-600",
    badge:
      "bg-violet-50 text-violet-600 dark:bg-violet-300/10 dark:text-violet-300",
  },
  paragraph: {
    label: "Paragraph",
    icon: BlockParagraphIcon,
    overlay: "border-blue-500/70 bg-blue-500/10",
    mutedOverlay: "border-blue-500/35 bg-blue-500/5",
    ring: "border-blue-500/60 bg-blue-500/5 text-blue-600",
    badge: "bg-blue-50 text-blue-600 dark:bg-blue-300/10 dark:text-blue-300",
  },
  list: {
    label: "List",
    icon: ViewListIcon,
    overlay: "border-emerald-500/70 bg-emerald-500/10",
    mutedOverlay: "border-emerald-500/35 bg-emerald-500/5",
    ring: "border-emerald-500/60 bg-emerald-500/5 text-emerald-600",
    badge:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-300/10 dark:text-emerald-300",
  },
  table: {
    label: "Table",
    icon: BlockTableIcon,
    overlay: "border-amber-500/70 bg-amber-500/10",
    mutedOverlay: "border-amber-500/35 bg-amber-500/5",
    ring: "border-amber-500/60 bg-amber-500/5 text-amber-700",
    badge:
      "bg-amber-50 text-amber-600 dark:bg-amber-300/10 dark:text-amber-300",
  },
  figure: {
    label: "Figure",
    icon: BlockFigureIcon,
    overlay: "border-rose-500/70 bg-rose-500/10",
    mutedOverlay: "border-rose-500/35 bg-rose-500/5",
    ring: "border-rose-500/60 bg-rose-500/5 text-rose-600",
    badge: "bg-rose-50 text-rose-600 dark:bg-rose-300/10 dark:text-rose-300",
  },
  header: {
    label: "Header",
    icon: BlockTitleIcon,
    overlay: "border-cyan-500/70 bg-cyan-500/10",
    mutedOverlay: "border-cyan-500/35 bg-cyan-500/5",
    ring: "border-cyan-500/60 bg-cyan-500/5 text-cyan-700",
    badge: "bg-cyan-50 text-cyan-600 dark:bg-cyan-300/10 dark:text-cyan-300",
  },
  footer: {
    label: "Footer",
    icon: BlockCaptionIcon,
    overlay: "border-slate-500/70 bg-slate-500/10",
    mutedOverlay: "border-slate-500/35 bg-slate-500/5",
    ring: "border-slate-500/60 bg-slate-500/5 text-slate-700",
    badge:
      "bg-slate-50 text-slate-600 dark:bg-slate-300/10 dark:text-slate-300",
  },
  page_number: {
    label: "Page number",
    icon: BlockNumberIcon,
    overlay: "border-zinc-500/70 bg-zinc-500/10",
    mutedOverlay: "border-zinc-500/35 bg-zinc-500/5",
    ring: "border-zinc-500/60 bg-zinc-500/5 text-zinc-700",
    badge: "bg-zinc-50 text-zinc-600 dark:bg-zinc-300/10 dark:text-zinc-300",
  },
}

function getBlockType(block: ParsedOcrBlock): OcrBlockType | undefined {
  if (block.type === "heading" || block.type === "section_heading") {
    return "heading"
  }

  if (block.type === "header") {
    return "header"
  }

  if (block.type === "footer") {
    return "footer"
  }

  if (block.type === "page_number") {
    return "page_number"
  }

  if (block.type === "figure" || block.type === "image") {
    return "figure"
  }

  if (block.type === "table") {
    return "table"
  }

  if (block.metadata.layoutClass === "List Item") {
    return "list"
  }

  if (block.type === "text") {
    return "paragraph"
  }
}

export function getOcrBlocks(output: ParsedOcrOutput): OcrBlock[] {
  return output.chunks.flatMap((chunk) =>
    chunk.blocks.flatMap((block) => {
      const type = getBlockType(block)
      const { page } = block.metadata

      if (!type || page.width <= 0 || page.height <= 0) {
        return []
      }

      return {
        id: block.id,
        type,
        text: block.content,
        page: page.number,
        pageWidth: page.width,
        pageHeight: page.height,
        confidence:
          block.metadata.avgOcrConfidence ??
          block.metadata.minOcrConfidence ??
          1,
        polygon: block.polygon,
        boundingBox: block.boundingBox,
      }
    })
  )
}

function getBoundingBox(block: OcrBlock): BoundingBox {
  if (block.boundingBox) {
    return block.boundingBox
  }

  const polygon = block.polygon ?? []
  const xValues = polygon.map((point) => point.x)
  const yValues = polygon.map((point) => point.y)
  const left = Math.min(...xValues)
  const right = Math.max(...xValues)
  const top = Math.min(...yValues)
  const bottom = Math.max(...yValues)

  return { left, top, right, bottom }
}

export function blockToArea(block: OcrBlock): React.CSSProperties {
  const { left, top, right, bottom } = getBoundingBox(block)

  return {
    left: `${(left / block.pageWidth) * 100}%`,
    top: `${(top / block.pageHeight) * 100}%`,
    width: `${((right - left) / block.pageWidth) * 100}%`,
    height: `${((bottom - top) / block.pageHeight) * 100}%`,
  }
}

const OcrBlockMarkdown = React.memo(function OcrBlockMarkdown({
  text,
}: {
  text: string
}) {
  const markdown = text.replace(OCR_MARKDOWN_FIGURE_CAPTION_PATTERN, (tag) =>
    tag.startsWith("</") ? "</figcaption>" : "<figcaption>"
  )

  return (
    <div className="space-y-1 text-sm leading-5 text-foreground/90">
      <ReactMarkdown
        rehypePlugins={OCR_MARKDOWN_REHYPE_PLUGINS}
        remarkPlugins={OCR_MARKDOWN_REMARK_PLUGINS}
        components={{
          h1: ({ node: _node, ...props }) => (
            <h1
              className="my-0 text-base leading-5 font-semibold text-foreground"
              {...props}
            />
          ),
          p: ({ node: _node, ...props }) => (
            <p className="my-0 text-[13px] leading-5" {...props} />
          ),
          ol: ({ node: _node, ...props }) => (
            <ol className="my-0 list-decimal space-y-0.5 pl-4" {...props} />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="overflow-hidden rounded-md border bg-background">
              <table className="w-full border-collapse text-xs" {...props} />
            </div>
          ),
          figure: ({ node: _node, ...props }) => (
            <figure
              className="my-0 space-y-2 rounded-md border bg-muted/20 p-2 text-[13px]"
              {...props}
            />
          ),
          figcaption: ({ node: _node, ...props }) => (
            <figcaption
              className="border-t pt-2 text-xs leading-5 text-muted-foreground"
              {...props}
            />
          ),
          caption: ({ node: _node, ...props }) => (
            <figcaption
              className="block border-t pt-2 text-xs leading-5 text-muted-foreground"
              {...props}
            />
          ),
          th: ({ node: _node, ...props }) => (
            <th className="border-b bg-muted px-2 py-1 text-left" {...props} />
          ),
          td: ({ node: _node, ...props }) => (
            <td className="border-t px-2 py-1" {...props} />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
})

const OcrBlockButton = React.memo(function OcrBlockButton({
  block,
  isActive,
  onFocusBlock,
}: {
  block: OcrBlock
  isActive: boolean
  onFocusBlock: (block: OcrBlock) => void
}) {
  const style = BLOCK_STYLES[block.type]
  const BlockIcon = style.icon

  return (
    <button
      type="button"
      onMouseEnter={() => onFocusBlock(block)}
      onFocus={() => onFocusBlock(block)}
      className={cn(
        "w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isActive && style.ring
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                style.badge
              )}
            >
              <BlockIcon className="size-3.5" />
              {style.label}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {Math.round(block.confidence * 100)}%
            </div>
          </div>
          <div className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            p. {block.page}
          </div>
        </div>
        <div className="mt-2 text-sm text-foreground/90">
          <OcrBlockMarkdown text={block.text} />
        </div>
      </div>
    </button>
  )
})

export const OcrBlockOverlay = React.memo(function OcrBlockOverlay({
  block,
  isActive,
}: {
  block: OcrBlock
  isActive?: boolean
}) {
  const style = BLOCK_STYLES[block.type]

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 border",
        isActive ? style.overlay : style.mutedOverlay
      )}
      style={blockToArea(block)}
    />
  )
})

export function OcrBlocksPanel({
  activeBlockId,
  blocks,
  className,
  onBlockFocus,
}: {
  activeBlockId?: string
  blocks: OcrBlock[]
  className?: string
  onBlockFocus?: (block: OcrBlock) => void
}) {
  const scrollViewportRef = React.useRef<HTMLDivElement | null>(null)
  const [localActiveBlockId, setLocalActiveBlockId] = React.useState(
    activeBlockId ?? blocks[0]?.id
  )
  const firstBlock = blocks[0]
  const focusedBlockId = activeBlockId ?? localActiveBlockId
  const activeBlock =
    blocks.find((block) => block.id === focusedBlockId) ?? firstBlock
  const focusedBlockIdRef = React.useRef(focusedBlockId)

  React.useEffect(() => {
    focusedBlockIdRef.current = focusedBlockId
  }, [focusedBlockId])

  const estimateBlockSize = React.useCallback(
    (index: number) => {
      const block = blocks[index]
      return block
        ? getEstimatedOcrBlockRowHeight(block)
        : OCR_BLOCK_ROW_MIN_ESTIMATE
    },
    [blocks]
  )
  const virtualizer = useVirtualizer({
    count: blocks.length,
    estimateSize: estimateBlockSize,
    getItemKey: (index) => blocks[index]?.id ?? index,
    getScrollElement: () => scrollViewportRef.current,
    overscan: 6,
  })

  const focusBlock = React.useCallback(
    (block: OcrBlock) => {
      if (block.id === focusedBlockIdRef.current) return

      focusedBlockIdRef.current = block.id
      setLocalActiveBlockId(block.id)
      onBlockFocus?.(block)
    },
    [onBlockFocus]
  )

  React.useEffect(() => {
    if (!firstBlock) return
    if (
      activeBlockId ||
      blocks.some((block) => block.id === localActiveBlockId)
    ) {
      return
    }

    setLocalActiveBlockId(firstBlock.id)
  }, [activeBlockId, blocks, firstBlock, localActiveBlockId])

  return (
    <aside
      className={cn("flex h-[420px] min-h-0 flex-col bg-background", className)}
    >
      <ScrollArea
        className="min-h-0 flex-1"
        scrollFade
        viewportRef={scrollViewportRef}
      >
        {blocks.length ? (
          <div
            className="relative"
            style={{
              height: virtualizer.getTotalSize() + OCR_BLOCK_LIST_PADDING * 2,
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const block = blocks[virtualRow.index]
              if (!block) return null

              return (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute top-0 right-3 left-3 pb-2 [contain:layout_paint]"
                  style={{
                    transform: `translateY(${
                      virtualRow.start + OCR_BLOCK_LIST_PADDING
                    }px)`,
                  }}
                >
                  <OcrBlockButton
                    block={block}
                    isActive={block.id === activeBlock?.id}
                    onFocusBlock={focusBlock}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              No layout blocks found.
            </div>
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}

export function OcrBlocks() {
  return (
    <OcrBlocksPanel blocks={getOcrBlocks(ATTENTION_OCR_OUTPUT).slice(0, 12)} />
  )
}
