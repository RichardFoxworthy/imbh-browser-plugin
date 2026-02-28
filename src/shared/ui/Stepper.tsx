import React from 'react';

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((step, i) => (
        <React.Fragment key={step}>
          <div className="flex items-center gap-1.5">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                i < currentStep
                  ? 'bg-blue-600 text-white'
                  : i === currentStep
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {i < currentStep ? '\u2713' : i + 1}
            </div>
            <span
              className={`text-xs ${
                i <= currentStep ? 'text-gray-900 font-medium' : 'text-gray-400'
              }`}
            >
              {step}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`flex-1 h-0.5 mx-1 ${
                i < currentStep ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
