import { ChevronDownIcon, PhoneIcon } from 'lucide-react'
import type React from 'react'
import { forwardRef } from 'react'
import * as RPNInput from 'react-phone-number-input'
import flags from 'react-phone-number-input/flags'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface PhoneInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  value?: string
  onChange?: (value: string | undefined) => void
  defaultCountry?: RPNInput.Country
}

export const PhoneInput = forwardRef<React.ElementRef<typeof RPNInput.default>, PhoneInputProps>(
  ({ className, value, onChange, defaultCountry = 'BR', ...props }, ref) => {
    return (
      <RPNInput.default
        ref={ref}
        className={cn('flex rounded-md shadow-xs min-w-50', className)}
        international
        flagComponent={FlagComponent}
        countrySelectComponent={CountrySelect}
        inputComponent={InputComponent}
        value={value}
        defaultCountry={defaultCountry}
        onChange={(newValue) => onChange?.(newValue ?? undefined)}
        {...(props as any)}
      />
    )
  },
)
PhoneInput.displayName = 'PhoneInput'

const InputComponent = forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, ...props }, ref) => (
    <Input
      ref={ref}
      data-slot="phone-input"
      className={cn('-ms-px rounded-s-none shadow-none focus-visible:z-10', className)}
      {...props}
    />
  ),
)
InputComponent.displayName = 'InputComponent'

type CountrySelectProps = {
  disabled?: boolean
  value: RPNInput.Country
  onChange: (value: RPNInput.Country) => void
  options: { label: string; value: RPNInput.Country | undefined }[]
}

const CountrySelect = ({ disabled, value, onChange, options }: CountrySelectProps) => {
  const handleSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as RPNInput.Country)
  }

  return (
    <div className="border-input bg-background text-muted-foreground focus-within:border-ring focus-within:ring-ring/50 hover:bg-accent hover:text-foreground has-aria-invalid:border-destructive/60 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40 relative inline-flex items-center self-stretch rounded-s-md border py-2 ps-3 pe-2 transition-[color,box-shadow] outline-none focus-within:z-10 focus-within:ring-[3px] has-disabled:pointer-events-none has-disabled:opacity-50">
      <div className="inline-flex items-center gap-1" aria-hidden="true">
        <FlagComponent country={value} countryName={value} aria-hidden="true" />
        <span className="text-muted-foreground/80">
          <ChevronDownIcon size={16} aria-hidden="true" />
        </span>
      </div>
      <select
        disabled={disabled}
        value={value || ''}
        onChange={handleSelect}
        className="absolute inset-0 text-sm opacity-0 bg-background rounded-lg"
        aria-label="Select country"
      >
        <option key="default" value="">
          Select a country
        </option>
        {options
          .filter((x) => x.value)
          .map((option, i) => (
            <option key={option.value ?? `empty-${i}`} value={option.value}>
              {option.label} {option.value && `+${RPNInput.getCountryCallingCode(option.value)}`}
            </option>
          ))}
      </select>
    </div>
  )
}

const FlagComponent = ({ country, countryName }: RPNInput.FlagProps) => {
  const Flag = flags[country]

  return (
    <span className="w-5 overflow-hidden rounded-sm">
      {Flag ? <Flag title={countryName} /> : <PhoneIcon size={16} aria-hidden="true" />}
    </span>
  )
}
