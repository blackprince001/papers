import { MotionConfig } from 'motion/react';
import { Navbar } from '@/components/sections/Navbar';
import { Hero } from '@/components/sections/Hero';
import { SourcesMarquee } from '@/components/sections/SourcesMarquee';
import AboutSection2 from '@/components/ui/about-section-2';
import { Features } from '@/components/sections/Features';
import { AiReading } from '@/components/sections/AiReading';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { Providers } from '@/components/sections/Providers';
import { FinalCta } from '@/components/sections/FinalCta';
import { Footer } from '@/components/sections/Footer';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip bg-off-white text-forest">
        <Navbar />
        <main>
          <Hero />
          <SourcesMarquee />
          <AboutSection2 />
          <Features />
          <AiReading />
          <HowItWorks />
          <Providers />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
