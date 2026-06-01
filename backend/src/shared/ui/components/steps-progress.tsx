// components/ui/step-progress.tsx
"use client";

import { cn } from "@/lib/utils";

type StepProgressProps = {
  currentStep: number;
  steps: string[];
};

export function StepProgress({ currentStep, steps }: StepProgressProps) {
  return (
    <div className="w-full flex items-center justify-between">
      {steps.map((step, index) => {
        const isActive = index + 1 === currentStep;
        const isCompleted = index + 1 < currentStep;

        return (
          <div key={step} className="flex-1 flex items-center">
            <div
              className={cn(
                "flex items-center justify-center size-8 rounded-full text-sm font-semibold transition-all duration-300",
                isActive
                  ? "bg-primary text-primary-foreground scale-110 shadow-md ring-4 ring-primary/20"
                  : isCompleted
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {index + 1}
            </div>
            {index !== steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-1 mx-2 rounded-full transition-all duration-300",
                  isCompleted ? "bg-emerald-500" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}