export interface Video {
    id: string
    userId?: string | null
    publicId: string
    title: string
    description: string
    originalSize: string
    compressedSize: string
    duration: number
    createdAt: Date
    updatedAt: Date
}