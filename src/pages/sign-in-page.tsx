import SignInForm from '@/components/auth/sign-in-form'
import { Logo } from '@/components/logo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-sm">
      <Card className="py-10 dark:bg-background/5 dark:border-secondary">
        <CardHeader className="flex flex-col items-center gap-2">
          <Logo className="h-8 mb-4" />
          <CardTitle className="text-center">
            <h1>Faça login na sua conta</h1>
          </CardTitle>
          <CardDescription className="text-center">
            Insira seu email abaixo para fazer login na sua conta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  )
}
