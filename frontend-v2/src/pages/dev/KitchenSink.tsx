import { useState } from 'react';
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

/* Dev-only QA surface for the HeroUI theme bridge + Lumen facades.
 * Everything here must look native to Lumen in BOTH themes. */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

  const toggleDark = () => {
    const root = document.documentElement;
    root.classList.toggle('dark');
    root.dataset.theme = root.classList.contains('dark') ? 'dark' : 'light';
    setDark(root.classList.contains('dark'));
  };

  return (
    <div className="min-h-dvh bg-(--background) text-(--foreground) px-8 py-10">
      <div className="mx-auto max-w-(--width-content-max) space-y-10">
        <header className="flex items-center gap-4">
          <h1>Kitchen Sink — HeroUI × Lumen</h1>
          <Button variant="outlined" size="sm" className="ml-auto" onClick={toggleDark}>
            {dark ? 'Dark' : 'Light'}
          </Button>
        </header>

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
          <Button icon={<PlusIcon size="sm" />}>With icon</Button>
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
