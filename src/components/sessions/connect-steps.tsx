'use client'

import { useEffect, useState } from 'react'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper'

const steps = [
  {
    step: 1,
    title: 'Abra o Whatsapp no seu celular',
  },
  {
    step: 2,
    title: 'Toque em Mais opções no Android ou Configurações no iPhone',
  },
  {
    step: 3,
    title: 'Toque em Dispositivos conectados, em seguida em Conectar dispositivo',
  },
  {
    step: 4,
    title: 'Escaneie o QR Code para confirmar',
  },
]

export default function ConnectSteps() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => {
        const next = prev + 1
        return next > steps.length ? 1 : next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-8 text-left max-w-80 min-w-80">
      <Stepper value={step} orientation="vertical">
        {steps.map(({ step: currentStep, title }) => (
          <StepperItem
            key={currentStep}
            step={currentStep}
            className="relative items-start not-last:flex-1"
          >
            <StepperTrigger className="items-start rounded pb-12 last:pb-0 pointer-events-none">
              <StepperIndicator />
              <div className="mt-0.5 space-y-0.5 px-2 text-left">
                <StepperTitle>{title}</StepperTitle>
              </div>
            </StepperTrigger>
            {currentStep < steps.length && (
              <StepperSeparator className="absolute inset-y-0 top-[calc(1.5rem+0.125rem)] left-3 -order-1 m-0 -translate-x-1/2 group-data-[orientation=horizontal]/stepper:w-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=horizontal]/stepper:flex-none group-data-[orientation=vertical]/stepper:h-[calc(100%-1.5rem-0.25rem)]" />
            )}
          </StepperItem>
        ))}
      </Stepper>
    </div>
  )
}
