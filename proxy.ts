import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isPublicPath } from "@/lib/auth/public-paths";
import {
  verifyImpersonateCookieEdge,
  IMPERSONATE_COOKIE_NAME_EDGE,
} from "@/lib/impersonate/cookie-edge";

const COOKIE_NAME = "sb-deskcomm-auth";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  // Inject X-Request-Id for downstream correlation (audit log, error wrappers).
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  response.headers.set("x-request-id", requestId);

  const { pathname, search } = request.nextUrl;
  // Expose pathname to Server Components via header (used by onboarding layout).
  response.headers.set("x-pathname", pathname);
  request.headers.set("x-pathname", pathname);

  // EPIC-11: in dev we route by path (`/admin/*`); in prod the
  // `admin.deskcomm.com` sub-domain is mapped via Vercel rewrites to the same
  // `/admin/*` paths. The host-based branch below stays a NOOP today and only
  // exists as documentation of the intended deploy topology.
  const host = request.headers.get("host") ?? "";
  const isAdminSurface = host.startsWith("admin.") || pathname.startsWith("/admin");

  if (isPublicPath(pathname)) {
    return response;
  }

  // As páginas protegidas já validam a sessão nos layouts server-side. Não
  // repetir getUser() no proxy: essa chamada de rede podia estourar o limite
  // da Vercel e bloquear a navegação inteira com 504.
  if (!pathname.startsWith('/api/')) {
    return response;
  }

  try {
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
        cookieOptions: {
          name: COOKIE_NAME,
          sameSite: "strict",
          httpOnly: true,
          secure: cookieSecure(),
          path: "/",
        },
      },
    );

    // Validate JWT server-side (NEVER use getSession on backend per CLAUDE.md).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      if (pathname.startsWith("/api/")) {
        return new NextResponse(
          JSON.stringify({
            error: {
              code: "unauthenticated",
              message: "Authentication required",
            },
          }),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "x-request-id": requestId,
            },
          },
        );
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname + search);
      return NextResponse.redirect(loginUrl);
    }

    if (pathname.startsWith("/app")) {
      const impCookie = request.cookies.get(IMPERSONATE_COOKIE_NAME_EDGE)?.value;
      if (impCookie) {
        const result = await verifyImpersonateCookieEdge(
          impCookie,
          env.IMPERSONATE_COOKIE_SECRET ?? "",
        );
        if (!result.valid) {
          console.warn(
            `[middleware] impersonate cookie invalid (${result.reason ?? "unknown"}) — clearing`,
          );
          response.cookies.delete(IMPERSONATE_COOKIE_NAME_EDGE);
        }
      }
    }

    if (isAdminSurface && pathname.startsWith("/admin") && pathname !== "/admin/forbidden") {
      const { data: isAdmin, error } = await supabase.rpc("fn_is_platform_admin");
      if (error || !isAdmin) {
        return NextResponse.redirect(new URL("/admin/forbidden", request.url));
      }
    }

    return response;
  } catch (err) {
    console.error("[proxy middleware] Erro no processamento de requisição:", err);
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({
          error: {
            code: "unauthenticated",
            message: "Authentication required",
          },
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
          },
        },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    // Run on all paths except static assets / Next internals.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
