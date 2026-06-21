import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookies) => cookies.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          ),
        },
      }
    )
    // Refresca la cookie de sesión si está por vencer — sin redirigir
    await supabase.auth.getSession()
  } catch {}

  return res
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/|favicon\\.ico|.*\\.png|.*\\.svg|.*\\.jpg|.*\\.json|.*\\.js|.*\\.ico).*)",
  ],
}
