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

export async function createHLSStream(url: string): Promise<ReadableStream<BufferData>> {
    let currentSegment = 0
    let playlist: string[] = []
    let baseUrl = url.substring(0, url.lastIndexOf('/') + 1)

    const fetchSegment = async (segmentUrl: string): Promise<ArrayBuffer> => {
        const response = await fetch(segmentUrl)
        return await response.arrayBuffer()
    }

    return new ReadableStream({
        async start(controller) {
            try {
                // First parse the master playlist
                const masterInfo = await parsePlaylist(url, baseUrl)
                
                if (masterInfo.isMaster && masterInfo.variantUrls.length > 0) {
                    // Select the best variant based on actual network conditions
                    const bestVariantUrl = await selectBestVariant(masterInfo.variantUrls, baseUrl)
                    const variantBaseUrl = bestVariantUrl.substring(0, bestVariantUrl.lastIndexOf('/') + 1)
                    const variantInfo = await parsePlaylist(bestVariantUrl, variantBaseUrl)
                    playlist = variantInfo.segmentUrls
                } else {
                    // Direct segment playlist
                    playlist = masterInfo.segmentUrls
                }

                while (currentSegment < playlist.length) {
                    const segmentUrl = playlist[currentSegment]
                    const data = await fetchSegment(segmentUrl)
                    controller.enqueue(new Uint8Array(data))
                    currentSegment++
                }
                controller.close()
            } catch (error) {
                controller.error(error)
            }
        }
    })
}
