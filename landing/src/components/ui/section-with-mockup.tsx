import React from 'react';
import { motion, type Variants } from 'motion/react';

interface SectionWithMockupProps {
  eyebrow?: string;
  title: string | React.ReactNode;
  description: string | React.ReactNode;
  /** Foreground mockup — a screenshot Placeholder or image. */
  mockup: React.ReactNode;
  reverseLayout?: boolean;
  /** Accent color for the eyebrow + decorative glow. */
  accentClassName?: string;
}

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

const SectionWithMockup: React.FC<SectionWithMockupProps> = ({
  eyebrow,
  title,
  description,
  mockup,
  reverseLayout = false,
  accentClassName = 'text-mint',
}) => {
  const layoutClasses = reverseLayout
    ? 'md:grid-cols-2 md:grid-flow-col-dense'
    : 'md:grid-cols-2';
  const textOrderClass = reverseLayout ? 'md:col-start-2' : '';
  const imageOrderClass = reverseLayout ? 'md:col-start-1' : '';

  return (
    <div className="relative">
      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-6 md:px-10">
        <motion.div
          className={`grid grid-cols-1 items-center gap-12 md:gap-16 ${layoutClasses}`}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {/* Text content */}
          <motion.div
            className={`mx-auto flex max-w-[546px] flex-col items-start gap-4 md:mx-0 ${textOrderClass}`}
            variants={itemVariants}
          >
            {eyebrow && (
              <span
                className={`text-sm font-semibold uppercase tracking-[0.12em] ${accentClassName}`}
              >
                {eyebrow}
              </span>
            )}
            <h2 className="text-3xl font-semibold leading-tight text-white md:text-[40px] md:leading-[1.15]">
              {title}
            </h2>
            <p className="text-[15px] leading-7 text-white/70">{description}</p>
          </motion.div>

          {/* Mockup content — rendered big, free to bleed past the edge */}
          <motion.div
            className={`relative w-full ${imageOrderClass}`}
            variants={itemVariants}
          >
            {mockup}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default SectionWithMockup;
