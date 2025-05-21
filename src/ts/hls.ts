import { BufferData } from "./types/graph"

export async function isHLSStream(url: string): Promise<boolean> {
    try {
        const response = await fetch(url)
        const contentType = response.headers.get('content-type')
        return contentType?.includes('application/vnd.apple.mpegurl') || 
               contentType?.includes('application/x-mpegurl') ||
               url.endsWith('.m3u8')
    } catch {
        return false
    }
}

export async function getStaticHLSMetadata(url: string): Promise<{ segmentCount: number; totalDuration: number }> {
    try {
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
        const playlistInfo = await parsePlaylist(url, baseUrl)
        

        const getMetadata = async (listInfo: PlaylistInfo) => {
            if (listInfo.segmentUrls.length == 0) return { segmentCount: 0, totalDuration: 0 }
            const segmentCount = listInfo.segmentUrls.length
            // Calculate total duration from the playlist
            let totalDuration = 0
            const response = await fetch(url)
            const text = await response.text()
            const lines = text.split('\n')
            
            for (const line of lines) {
                if (line.startsWith('#EXTINF:')) {
                    const durationMatch = line.match(/#EXTINF:([\d.]+)/)
                    if (durationMatch) {
                        totalDuration += parseFloat(durationMatch[1])
                    }
                }
            }

            return { segmentCount, totalDuration }
        }

        // If it's a master playlist, we need to get the segments from the best variant
        if (playlistInfo.isMaster && playlistInfo.variantUrls.length > 0) {
            const bestVariantUrl = await selectBestVariant(playlistInfo.variantUrls, baseUrl)
            const variantBaseUrl = bestVariantUrl.substring(0, bestVariantUrl.lastIndexOf('/') + 1)
            const variantInfo = await parsePlaylist(bestVariantUrl, variantBaseUrl)
            return getMetadata(variantInfo)
        } else {
            // Direct segment playlist
            return getMetadata(playlistInfo)
        }
    } catch (error) {
        console.error('Error getting HLS metadata:', error)
        return { segmentCount: 0, totalDuration: 0 }
    }
}

interface PlaylistInfo {
    isMaster: boolean
    variantUrls: { url: string; bandwidth: number }[]
    segmentUrls: string[]
}

async function parsePlaylist(url: string, baseUrl: string): Promise<PlaylistInfo> {
    const response = await fetch(url)
    const text = await response.text()
    const lines = text.split('\n')
    
    const isMaster = lines.some(line => line.includes('#EXT-X-STREAM-INF'))
    const variantUrls: { url: string; bandwidth: number }[] = []
    const segmentUrls: string[] = []
    
    let currentLine = 0
    while (currentLine < lines.length) {
        const line = lines[currentLine].trim()
        
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            // Master playlist variant
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/)
            const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0
            
            currentLine++
            const variantUrl = lines[currentLine].trim()
            if (variantUrl && !variantUrl.startsWith('#')) {
                variantUrls.push({
                    url: new URL(variantUrl, baseUrl).href,
                    bandwidth: bandwidth
                })
            }
        } else if (line.startsWith('#EXTINF')) {
            // Segment duration info
            currentLine++
            const segmentUrl = lines[currentLine].trim()
            if (segmentUrl && !segmentUrl.startsWith('#')) {
                segmentUrls.push(new URL(segmentUrl, baseUrl).href)
            }
        }
        currentLine++
    }
    
    return { isMaster, variantUrls, segmentUrls }
}

async function measureNetworkSpeed(url: string): Promise<number> {
    const startTime = performance.now()
    const response = await fetch(url)
    const data = await response.arrayBuffer()
    const endTime = performance.now()
    
    // Calculate speed in bits per second
    const durationInSeconds = (endTime - startTime) / 1000
    const sizeInBits = data.byteLength * 8
    return sizeInBits / durationInSeconds
}

async function selectBestVariant(variants: { url: string; bandwidth: number }[], baseUrl: string): Promise<string> {
    // First try the highest bandwidth variant
    const sortedVariants = [...variants].sort((a, b) => b.bandwidth - a.bandwidth)
    
    for (const variant of sortedVariants) {
        try {
            // Get the first segment URL from the variant playlist
            const variantInfo = await parsePlaylist(variant.url, baseUrl)
            if (variantInfo.segmentUrls.length > 0) {
                const segmentUrl = variantInfo.segmentUrls[0]
                const actualSpeed = await measureNetworkSpeed(segmentUrl)
                
                // If actual speed is at least 80% of the variant's bandwidth, use this variant
                if (actualSpeed >= variant.bandwidth * 0.8) {
                    return variant.url
                }
            }
        } catch (error) {
            console.warn(`Failed to measure speed for variant ${variant.url}:`, error)
            continue
        }
    }
    
    // If no variant meets the speed requirement, fall back to the lowest bandwidth
    return sortedVariants[0].url
}

export async function createHLSStream(url: string, options: { maxBufferSize?: number } = {}): Promise<ReadableStream<BufferData>> {
    let currentSegment = 0
    let playlist: string[] = []
    let baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
    let isLive = false
    let lastUpdateTime = Date.now()
    const maxBufferSize = options.maxBufferSize || 3 // Default segments in buffer stream

    const fetchSegment = async (segmentUrl: string): Promise<ArrayBuffer> => {
        const response = await fetch(segmentUrl)
        return await response.arrayBuffer()
    }

    const updatePlaylist = async () => {
        try {
            const masterInfo = await parsePlaylist(url, baseUrl)
            
            if (masterInfo.isMaster && masterInfo.variantUrls.length > 0) {
                const bestVariantUrl = await selectBestVariant(masterInfo.variantUrls, baseUrl)
                const variantBaseUrl = bestVariantUrl.substring(0, bestVariantUrl.lastIndexOf('/') + 1)
                const variantInfo = await parsePlaylist(bestVariantUrl, variantBaseUrl)
                playlist = variantInfo.segmentUrls
            } else {
                playlist = masterInfo.segmentUrls
            }
            
            // Check if this is a live stream
            isLive = playlist.some(url => url.includes('live') || url.includes('event'))
            lastUpdateTime = Date.now()
        } catch (error) {
            console.error('Error updating playlist:', error)
        }
    }

    return new ReadableStream({
        async start(controller) {
            await updatePlaylist()
        },

        async pull(controller) {
            try {
                // For live streams, check for playlist updates every 5 seconds
                if (isLive && Date.now() - lastUpdateTime > 5000) {
                    await updatePlaylist()
                }

                // If we've reached the end of the playlist
                if (currentSegment >= playlist.length) {
                    if (isLive) {
                        // For live streams, wait for new segments
                        await new Promise(resolve => setTimeout(resolve, 1000))
                        await updatePlaylist()
                    } else {
                        // For VOD, close the stream
                        controller.close()
                        return
                    }
                }

                // Calculate how many segments to buffer
                const segmentsToBuffer = Math.min(
                    maxBufferSize,
                    playlist.length - currentSegment
                )

                // Fetch and enqueue multiple segments up to the buffer limit
                for (let i = 0; i < segmentsToBuffer; i++) {
                    const segmentUrl = playlist[currentSegment + i]
                    const data = await fetchSegment(segmentUrl)
                    controller.enqueue(new Uint8Array(data))
                }
                currentSegment += segmentsToBuffer

                // If we have more segments to buffer, schedule another pull
                if (currentSegment < playlist.length) {
                    // The stream will automatically call pull again when the consumer is ready
                    return
                }
            } catch (error) {
                controller.error(error)
            }
        },

        cancel() {
            // Clean up any resources if needed
            currentSegment = 0
            playlist = []
        }
    })
}
