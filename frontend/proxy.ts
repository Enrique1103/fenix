import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )

  // getUser() valida el JWT en Supabase y renueva el token si expiró.
  // getSession() solo lee la cookie y falla con tokens expirados → causa el flash.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = req.nextUrl

  if (!user && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url))
  }
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return res
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/|favicon\\.ico|.*\\.png|.*\\.svg|.*\\.jpg|.*\\.json|.*\\.js|.*\\.ico).*)",
  ],
}
