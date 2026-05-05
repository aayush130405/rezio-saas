import {NextRequest, NextResponse} from "next/server"
import { PrismaClient } from "@/app/generated/prisma"
import { auth } from "@clerk/nextjs/server"
import { v2 as cloudinary } from "cloudinary"

const prisma = new PrismaClient()

cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

async function getCompressedVideoSize(publicId: string) {
    const optimizedUrl = cloudinary.url(publicId, {
        resource_type: "video",
        secure: true,
        transformation: [{ quality: "auto", fetch_format: "mp4" }],
    })

    const response = await fetch(optimizedUrl, {
        method: "HEAD",
        cache: "no-store",
    })

    if (!response.ok) {
        return null
    }

    const contentLength = response.headers.get("content-length")
    if (!contentLength) {
        return null
    }

    const parsed = Number(contentLength)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export async function GET() {
    const { userId } = await auth()
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const videos = await prisma.video.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: "desc"
            }
        })

        const staleVideos = videos.filter((video) => {
            const original = Number(video.originalSize)
            const compressed = Number(video.compressedSize)
            return Number.isFinite(original) && Number.isFinite(compressed) && compressed >= original
        })

        if (staleVideos.length > 0) {
            await Promise.all(
                staleVideos.map(async (video) => {
                    const recalculated = await getCompressedVideoSize(video.publicId)
                    if (recalculated && recalculated > 0) {
                        await prisma.video.update({
                            where: { id: video.id },
                            data: { compressedSize: String(recalculated) },
                        })
                    }
                })
            )
        }

        const refreshedVideos = await prisma.video.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: "desc",
            },
        })

        return NextResponse.json(refreshedVideos)
    } catch {
        return NextResponse.json({error: "Error fetching videos"}, {status: 500})
    } finally {
        await prisma.$disconnect()
    }
}

export async function POST(request: NextRequest) {
    const { userId } = await auth()
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json() as {
            title: string
            description?: string
            publicId: string
            originalSize: string
            compressedSize?: string
            duration?: number
        }

        const computedCompressedSize = await getCompressedVideoSize(body.publicId)

        const video = await prisma.video.create({
            data: {
                title: body.title,
                description: body.description,
                publicId: body.publicId,
                originalSize: body.originalSize,
                compressedSize: String(
                    computedCompressedSize ?? Number(body.compressedSize ?? body.originalSize)
                ),
                duration: body.duration ?? 0,
                userId,
            },
        })

        return NextResponse.json(video, { status: 201 })
    } catch {
        return NextResponse.json({ error: "Error creating video" }, { status: 500 })
    } finally {
        await prisma.$disconnect()
    }
}