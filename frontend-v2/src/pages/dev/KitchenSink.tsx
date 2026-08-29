import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Chip,
  Input,
  Label,
  Select,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  ListBox,
  ListBoxItem,
  Skeleton as HeroSkeleton,
  Switch,
  TextField,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import { ArchiveIcon, PlusIcon, SearchIcon, TrashIcon } from '../../components/icons';
import { MarkdownMessage } from '../../components/MarkdownMessage';
import { StreamingMessage } from '../../components/ai/StreamingMessage';
import { AgentStatus } from '../../components/ai/AgentStatus';
import { ThinkingOrb } from '../../components/ai/ThinkingOrb';

/* Dev-only QA surface for the HeroUI theme bridge + Lumen facades.
 * Everything here must look native to Lumen in BOTH themes. */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-caption font-semibold uppercase tracking-wide text-(--muted-foreground)">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export default function KitchenSink() {
  const [dark, setDark] = useState(() => {
    // ?theme=light|dark lets headless screenshot runs pin either theme.
    const forced = new URLSearchParams(window.location.search).get('theme');
    if (forced === 'dark' || forced === 'light') {
      document.documentElement.classList.toggle('dark', forced === 'dark');
      document.documentElement.dataset.theme = forced;
    }
    return document.documentElement.classList.contains('dark');
  });
  const [tab, setTab] = useState('one');
  const [motionMode, setMotionMode] = useState<'full' | 'reduced'>(() =>
    new URLSearchParams(window.location.search).get('motion') === 'reduced' ? 'reduced' : 'full',
  );
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() =>
    new URLSearchParams(window.location.search).get('density') === 'compact' ? 'compact' : 'comfortable',
  );
  const [viewport, setViewport] = useState<'wide' | 'narrow'>(() =>
    new URLSearchParams(window.location.search).get('width') === 'narrow' ? 'narrow' : 'wide',
  );
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reviewMotion = motionMode;
    root.dataset.reviewDensity = density;
    return () => {
      delete root.dataset.reviewMotion;
      delete root.dataset.reviewDensity;
    };
  }, [motionMode, density]);

  const toggleDark = () => {
    const root = document.documentElement;
    root.classList.toggle('dark');
    root.dataset.theme = root.classList.contains('dark') ? 'dark' : 'light';
    setDark(root.classList.contains('dark'));
  };

  return (
    <div data-review-viewport={viewport} className="min-h-dvh bg-(--background) text-(--foreground) px-8 py-10">
      <div className={`mx-auto ${density === 'compact' ? 'space-y-4' : 'space-y-10'} ${viewport === 'narrow' ? 'max-w-xl' : 'max-w-(--width-content-max)'}`}>
        <header className="flex items-center gap-4">
          <h1>Kitchen Sink — HeroUI × Lumen</h1>
          <Button variant="outlined" size="sm" className="ml-auto" onClick={toggleDark}>
            {dark ? 'Dark' : 'Light'}
          </Button>
        </header>

        <Section title="Review controls">
          <label className="flex items-center gap-2 text-code">
            Motion
            <select aria-label="Review motion" value={motionMode} onChange={(e) => setMotionMode(e.target.value as 'full' | 'reduced')} className="h-9 rounded-lg border border-(--border) bg-(--white) px-2">
              <option value="full">Full motion</option>
              <option value="reduced">Reduced motion</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-code">
            Density
            <select aria-label="Review density" value={density} onChange={(e) => setDensity(e.target.value as 'comfortable' | 'compact')} className="h-9 rounded-lg border border-(--border) bg-(--white) px-2">
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-code">
            Width
            <select aria-label="Review width" value={viewport} onChange={(e) => setViewport(e.target.value as 'wide' | 'narrow')} className="h-9 rounded-lg border border-(--border) bg-(--white) px-2">
              <option value="wide">Wide</option>
              <option value="narrow">Narrow</option>
            </select>
          </label>
          <Button variant={offline ? 'destructive' : 'outlined'} size="sm" onClick={() => setOffline((value) => !value)}>
            {offline ? 'Offline fixture on' : 'Show offline state'}
          </Button>
        </Section>

        {offline && (
          <Alert status="warning" role="status">
            You are offline. Saved papers remain available, but new searches and AI requests will retry when the connection returns.
          </Alert>
        )}

        <Section title="Button facade — variants">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="primary-lg">Primary LG</Button>
          <Button variant="icon" aria-label="Add">
            <PlusIcon size="md" />
          </Button>
        </Section>

        <Section title="Button facade — sizes / icon / loading">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button icon={<PlusIcon size="sm" />}>Label on desktop, icon on mobile</Button>
          <Button loading>Saving…</Button>
          <Button variant="secondary" loading>
            Loading
          </Button>
          <Button variant="icon" size="icon-xs" aria-label="Delete">
            <TrashIcon size="xs" />
          </Button>
          <Button variant="icon" size="icon-sm" aria-label="Delete">
            <TrashIcon size="xs" />
          </Button>
          <Button variant="icon" size="icon" aria-label="Delete">
            <TrashIcon size="sm" />
          </Button>
          <Button variant="icon" size="icon-lg" aria-label="Delete">
            <TrashIcon size="md" />
          </Button>
        </Section>

        <Section title="Spinner (ours)">
          <Spinner size="xs" />
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" className="text-(--muted-foreground)" />
        </Section>

        <Section title="HeroUI raw — field primitives (pre-facade)">
          <TextField className="w-56">
            <Label>Email</Label>
            <Input placeholder="you@lab.org" />
          </TextField>
          <Select className="w-44" placeholder="Sort by…">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopover>
              <ListBox>
                <ListBoxItem id="recent">Most recent</ListBoxItem>
                <ListBoxItem id="title">Title</ListBoxItem>
                <ListBoxItem id="year">Year</ListBoxItem>
              </ListBox>
            </SelectPopover>
          </Select>
          <Switch>Semantic search</Switch>
          <Chip>Machine Learning</Chip>
          <Chip color="success">Processed</Chip>
          <TooltipTrigger>
            <Button variant="outlined" size="sm">
              Hover me
            </Button>
            <Tooltip>
              <TooltipContent>Lumen tooltip</TooltipContent>
            </Tooltip>
          </TooltipTrigger>
        </Section>

        <Section title="HeroUI raw — feedback">
          <Alert status="warning" className="max-w-md">
            Semantic search is degraded; results may be incomplete.
          </Alert>
          <HeroSkeleton className="h-10 w-40 rounded-lg" />
        </Section>

        <Section title="Skeletons (ours)">
          <div className="w-64 space-y-2">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <SkeletonText lines={3} />
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-(--border) bg-(--card)">
            <EmptyState
              icon={ArchiveIcon}
              size="panel"
              title="No saved discoveries yet"
              description="Runs you save from Discovery will appear here."
              actions={<Button size="sm" icon={<SearchIcon size="xs" />}>Start discovering</Button>}
            />
          </div>
          <div className="rounded-2xl border border-(--border) bg-(--card)">
            <ErrorState
              size="panel"
              title="Couldn't load recommendations"
              description="The server said no. It happens."
              onRetry={() => {}}
            />
          </div>
        </div>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-(--border) bg-(--card) p-5 space-y-3">
            <h2 className="text-subheading font-semibold">Long content fixture</h2>
            <h3 className="text-body font-semibold truncate" title="A very long paper title that should remain understandable when the available reading width is narrow">
              A very long paper title that should remain understandable when the available reading width is narrow
            </h3>
            <p className="text-code text-(--muted-foreground)">
              This paragraph intentionally carries enough copy to expose wrapping, truncation, line-height, and action placement problems across wide and narrow review widths. It represents the kind of source title and evidence note that appears in a real research library.
            </p>
          </div>
          <div className="rounded-2xl border border-(--border) bg-(--card) p-5 space-y-3">
            <h2 className="text-subheading font-semibold">AI activity fixture</h2>
            <div className="flex items-center gap-2">
              <ThinkingOrb status="streaming" size="sm" decorative />
              <AgentStatus status="streaming" label="Generating an answer" />
            </div>
            <StreamingMessage
              status="using_tool"
              content=""
              displayedContent=""
              activities={[{
                id: 'activity-1',
                kind: 'tool',
                state: 'running',
                label: 'Searching your papers',
                detail: 'attention',
              }]}
              sources={[]}
              warning={null}
              retry={null}
              error={null}
              isStreaming
            />
            <MarkdownMessage content="The answer will appear here with **grounded citations** when the search completes." />
          </div>
        </section>

        <Section title="Tabs (ours) — segmented + underline">
          <Tabs value={tab} onValueChange={setTab} variant="segmented">
            <TabsList>
              <TabsTrigger value="one">Grid</TabsTrigger>
              <TabsTrigger value="two">List</TabsTrigger>
              <TabsTrigger value="three">Table</TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="pt-3 text-code text-(--muted-foreground)">
              Grid view content
            </TabsContent>
            <TabsContent value="two" className="pt-3 text-code text-(--muted-foreground)">
              List view content
            </TabsContent>
            <TabsContent value="three" className="pt-3 text-code text-(--muted-foreground)">
              Table view content
            </TabsContent>
          </Tabs>
        </Section>
      </div>
    </div>
  );
}
