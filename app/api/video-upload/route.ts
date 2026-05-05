import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@/app/generated/prisma';

const prisma = new PrismaClient()

// Configuration
cloudinary.config({ 
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

interface CloudinaryUploadResult {
    public_id: string
    bytes: number
    duration?: number
    [key: string]: unknown
}

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

export async function POST(request: NextRequest) {
    const {userId} = await auth()

    if(!userId) {
        return NextResponse.json({error: "User is not logged in"}, {status: 401})
    }

    if(
        !process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
    ) {
        return NextResponse.json({error: "Cloudinary credentials not found"}, {status: 500})
    }

    try {
        const formData = await request.formData()       //grab the form data from the frontend
        
        const file = formData.get("file") as File | null    //grab the file from the formdata
        const title = formData.get("title") as string
        const description = formData.get("description") as string
        const originalSize = formData.get("originalSize") as string

        if(!file) {
            return NextResponse.json({error: "No file uploaded"}, {status: 400})
        }

        //now grab the array buffer from the file, create a new buffer and then upload it to cloudinary
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)       //create a buffer from the bytes that are grabbed from file

        const result = await new Promise<CloudinaryUploadResult>(
            (resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "video",
                        folder: "video-uploads",
                        transformation: [
                            {quality: "auto", fetch_format: "mp4"}
                        ]
                    },
                    (error, result) => {
                        if(error) reject(error)
                        else resolve(result as CloudinaryUploadResult)
                    }
                )
                uploadStream.end(buffer)
            }
        )

        const video = await prisma.video.create({
            data: {
                userId,
                title,
                description,
                publicId: result.public_id,
                originalSize,
                compressedSize: String(
                    (await getCompressedVideoSize(result.public_id)) ?? result.bytes ?? Number(originalSize)
                ),
                duration: result.duration || 0
            }
        })

        return NextResponse.json(video)
    } catch (error) {
        console.log("Upload video failed", error);
        return NextResponse.json({error: "Upload video failed"}, {status: 500})
    } finally {
        await prisma.$disconnect()
    }
}