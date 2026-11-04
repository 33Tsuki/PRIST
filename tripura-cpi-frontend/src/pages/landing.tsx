import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
            PRIST
          </h1>
          <p className="mb-8 text-lg text-muted-foreground md:text-xl">
            Price Reporting Index System for Tripura
          </p>
          <Button asChild size="lg" className="text-base px-8">
            <Link to="/login">Login</Link>
          </Button>
        </div>
      </div>
      <footer className="bg-foreground py-5 text-center text-sm text-primary-foreground">
        Maintained by SOSU ISI
      </footer>
    </div>
  )
}
