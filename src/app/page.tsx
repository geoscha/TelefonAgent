import { DemoBot } from "@/components/landing/DemoBot";
import { LandingFrame } from "@/components/landing/LandingFrame";
import { LandingNav } from "@/components/landing/LandingNav";

export default function LandingPage() {
  return (
    <LandingFrame>
      <LandingNav />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-6 sm:px-6 sm:pb-10">
        <DemoBot />
      </main>
    </LandingFrame>
  );
}
