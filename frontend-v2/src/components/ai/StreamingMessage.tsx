import AIResponse, { type AIResponseProps } from '@/components/ai/AIResponse';

export type StreamingMessageProps = Omit<AIResponseProps, 'className'> & {
  className?: string;
};

/** Compatibility name for the shared AI response renderer. */
export function StreamingMessage(props: StreamingMessageProps) {
  return <AIResponse {...props} />;
}

export default StreamingMessage;
