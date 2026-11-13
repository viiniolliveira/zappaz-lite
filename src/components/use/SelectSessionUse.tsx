import { useId } from 'react'
import { useFormContext } from 'react-hook-form'
import SessionSelect from '@/components/sessions/session-select'
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'

export default function SelectSessionUse() {
  const { control } = useFormContext()
  const id = useId()
  return (
    <FormField
      control={control}
      name="sessionId"
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={id}>Sessão</FormLabel>
          <FormControl>
            <SessionSelect
              id={id}
              value={field.value || ''}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          </FormControl>
        </FormItem>
      )}
    />
  )
}
