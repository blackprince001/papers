import { FileText, Search, Baby, Lightbulb } from 'lucide-react';

export interface DefaultPrompt {
  id: string;
  label: string;
  icon: typeof FileText;
  content: string;
  description: string;
}

export const defaultPrompts: DefaultPrompt[] = [
  {
    id: 'summarize',
    label: 'Review & Summarize',
    icon: FileText,
    description: 'Get a comprehensive summary of the paper\'s key points',
    content: "Please provide a comprehensive summary of this paper. Start with a one-sentence hook stating the paper's main contribution. Then, break down the key findings, methodology, and conclusions into bullet points. Finally, assess the paper's strengths and limitations."
  },
  {
    id: 'critique',
    label: 'Critique Methodology',
    icon: Search,
    description: 'Analyze the research design and potential biases',
    content: "Analyze the methodology section of this paper. Identify the research design, data collection methods, and analytical techniques used. How effective are these methods for addressing the research question? Are there any potential biases or limitations in the study design that the authors didn't address?"
  },
  {
    id: 'eli5',
    label: 'Explain Like I\'m 5',
    icon: Baby,
    description: 'Simple explanation of core concepts',
    content: "Explain the core concept of this paper as if I were a 5-year-old. Use simple analogies and avoid jargon. Focus on the 'why' and 'how' rather than the technical details. What is the big idea here?"
  },
  {
    id: 'future-work',
    label: 'Future Work',
    icon: Lightbulb,
    description: 'Explore applications and next steps',
    content: "Based on the results and conclusions, what are the potential real-world applications of this research? Also, suggest three specific directions for future work that could build upon these findings."
  }
];
