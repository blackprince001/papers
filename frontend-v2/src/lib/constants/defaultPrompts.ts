import type { ComponentType } from 'react';
import {
  ChartBarsIcon,
  CheckCircleIcon,
  EyeIcon,
  FileTextIcon,
  GlobeIcon,
  InsightIcon,
  LinkIcon,
  MicroscopeIcon,
  NoteIcon,
  SearchIcon,
  ShieldIcon,
  UserIcon,
  type IconProps,
} from '@/components/icons';

export interface DefaultPrompt {
  id: string;
  label: string;
  icon: ComponentType<IconProps>;
  content: string;
  description: string;
}

export const defaultPrompts: DefaultPrompt[] = [
  {
    id: 'summarize',
    label: 'Review & Summarize',
    icon: FileTextIcon,
    description: "Comprehensive summary of the paper's key points",
    content:
      "Please provide a comprehensive summary of this paper. Start with a one-sentence hook stating the paper's main contribution. Then, break down the key findings, methodology, and conclusions into bullet points. Finally, assess the paper's strengths and limitations.",
  },
  {
    id: 'eli5',
    label: "Explain Like I'm 5",
    icon: UserIcon,
    description: 'Simple explanation of core concepts',
    content:
      "Explain the core concept of this paper as if I were a 5-year-old. Use simple analogies and avoid jargon. Focus on the 'why' and 'how' rather than the technical details. What is the big idea here?",
  },
  {
    id: 'initial-screen',
    label: 'The Initial Screen',
    icon: EyeIcon,
    description: 'Core identity questions for Title, Abstract, Introduction, and Conclusion',
    content:
      'In one sentence, what is the core problem or phenomenon the authors are investigating?\nWhat is the main argument or hypothesis they are putting forward?\nWhat is the ultimate conclusion or main takeaway the authors want the reader to believe?',
  },
  {
    id: 'critique',
    label: 'Critique Methodology',
    icon: SearchIcon,
    description: 'Analyze the research design and potential biases',
    content:
      "Analyze the methodology section of this paper. Identify the research design, data collection methods, and analytical techniques used. How effective are these methods for addressing the research question? Are there any potential biases or limitations in the study design that the authors didn't address?",
  },
  {
    id: 'deep-dive',
    label: 'The Deep Dive',
    icon: MicroscopeIcon,
    description: 'Evidence, citations, and reference-chain evaluation',
    content:
      'How exactly did they gather their data or test their claims (e.g., qualitative interviews, RCT, historical analysis)?\nAre there obvious flaws, biases, or limitations in their design? (e.g., sample size, dataset freshness, ignored variables)\nDo the charts, data, and evidence actually support the claims, or are the authors overstating their findings?\nWhich references underpin the strongest claims? Are those sources credible, recent, and correctly interpreted?\nAre there key papers the authors should have cited but conspicuously did not?\nWhat would it take to verify or falsify the central result?',
  },
  {
    id: 'figures-breakdown',
    label: 'Figures First',
    icon: ChartBarsIcon,
    description: 'Analyze every figure, table, and visualization',
    content:
      'List every figure and table in the paper. For each one: what is it showing, and why did the authors include it?\nAre the visualizations clear and appropriately chosen for the data?\nDo any figures seem misleading, cherry-picked, or lacking error bars / confidence intervals?\nWhat trends or patterns appear in the figures that the authors did not highlight in the text?',
  },
  {
    id: 'landscape',
    label: 'The Landscape',
    icon: GlobeIcon,
    description: 'Contextualization within the broader literature',
    content:
      'Who are the authors building upon, and who are they arguing against?\nDoes this paper agree with, contradict, or completely pivot away from the standard consensus in the field?\nWhat do the authors explicitly admit they missed, could not prove, or left out of scope?',
  },
  {
    id: 'claims-evidence',
    label: 'Claims & Evidence',
    icon: CheckCircleIcon,
    description: 'Map every claim to its supporting evidence',
    content:
      'List the 3–5 strongest claims made in the paper.\nFor each claim: what direct evidence supports it? Does the evidence convincingly justify the claim, or are there gaps?\nAre there claims in the abstract or introduction that are not backed by results later in the paper?\nWhich claims are speculative vs. empirically supported?',
  },
  {
    id: 'citation-radar',
    label: 'Citation Radar',
    icon: LinkIcon,
    description: 'Trace the reference chain and discover key related work',
    content:
      'Which 3–5 papers cited here seem most foundational to the claims?\nAre there landmark or seminal papers that the authors engaged with (or conspicuously ignored)?\nWhat is the citation trajectory: do later citations support, challenge, or refine the authors\' conclusions?\nSuggest 2–3 papers I should read next to deepen my understanding of this topic.',
  },
  {
    id: 'reproducibility',
    label: 'Reproducibility Check',
    icon: ShieldIcon,
    description: 'Assess reproducibility and resource availability',
    content:
      'Is the dataset publicly available? If so, where?\nIs the code released, and does it run on standard hardware?\nAre all hyperparameters, random seeds, and preprocessing steps documented?\nAre evaluation metrics appropriate and reported with variance / confidence intervals?\nWhat would a practitioner need to do to reproduce the results from scratch?',
  },
  {
    id: 'future-work',
    label: 'Future Work',
    icon: InsightIcon,
    description: 'Explore applications and next steps',
    content:
      'Based on the results and conclusions, what are the potential real-world applications of this research?\nAlso, suggest three specific directions for future work that could build upon these findings.',
  },
  {
    id: 'synthesis',
    label: 'The Synthesis',
    icon: NoteIcon,
    description: 'Knowledge-building questions to retain the paper long-term',
    content:
      'What are the key terms, frameworks, or theories defined in this paper that I need to add to my foundational knowledge?\nWhat are the big open questions or "future work" identified in this paper?\nIf I had to summarize this paper\'s overall contribution to the field in just three bullet points, what would they be?',
  },
];
