import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
    "/sign-in",
    "/sign-up",
    "/"
])

export default clerkMiddleware(async (auth, req) => {
    const {userId} = await auth()

    //if logged in
    if(userId && isPublicRoute(req)) {
        return NextResponse.redirect(new URL("/home", req.url))
    }

    //not logged in 
    if(!userId) {
        if(!isPublicRoute(req)) {
            //means user is not loggedin and trying to access a secured route
            return NextResponse.redirect(new URL("/sign-in", req.url))
        }
    }

    return NextResponse.next()
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};