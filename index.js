const express = require("express");
const ytdl = require('@distube/ytdl-core');
const cors = require("cors");

const app = express();

// 요청 크기 제한 증가 (Railway를 위한 설정)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS 설정 - 모든 origin 허용 (프로덕션에서는 특정 도메인으로 제한 권장)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'User-Agent'],
  credentials: false
}));

// OPTIONS 요청 처리 (preflight)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, User-Agent');
  res.sendStatus(200);
});

app.get("/", (req, res) => {
    const ping = new Date();
    ping.setHours(ping.getHours() - 3);
    console.log(
        `Ping at: ${ping.getUTCHours()}:${ping.getUTCMinutes()}:${ping.getUTCSeconds()}`
    );
    res.header('Access-Control-Allow-Origin', '*');
    res.sendStatus(200);
});

app.get("/info", async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        const info = (await ytdl.getInfo(url)).videoDetails;
        const title = info.title;
        const thumbnail = info.thumbnails[2]?.url || info.thumbnails[0]?.url;

        res.header('Access-Control-Allow-Origin', '*');
        res.json({ title: title, thumbnail: thumbnail });
    } catch (error) {
        console.error("Error in /info:", error);
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

app.get("/mp3", async (req, res) => {
    let stream = null;
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        console.log(`[MP3] Request received for URL: ${url}`);

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        console.log(`[MP3] Fetching video info...`);
        const info = await ytdl.getInfo(url);
        const videoName = info.videoDetails.title;
        
        // 파일명 안전하게 처리 (특수문자 제거)
        const safeFileName = videoName.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() || 'video';

        console.log(`[MP3] Video title: ${videoName}`);
        console.log(`[MP3] Starting download...`);

        // 스트림 생성 및 에러 핸들링
        // 이미 가져온 info를 사용하여 format 선택 후 스트림 생성 (403 오류 방지)
        try {
            const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
            
            if (audioFormats.length === 0) {
                // audioonly가 없으면 비디오+오디오 포맷에서 오디오만 추출
                const formatsWithAudio = info.formats.filter(f => f.hasAudio);
                if (formatsWithAudio.length === 0) {
                    throw new Error('No audio formats available');
                }
                // 가장 낮은 비트레이트의 포맷 선택 (403 오류 가능성 낮음)
                const format = formatsWithAudio.sort((a, b) => (a.audioBitrate || 0) - (b.audioBitrate || 0))[0];
                console.log(`[MP3] Selected format (fallback): ${format.qualityLabel || format.audioQuality || 'default'}`);
                stream = ytdl.downloadFromInfo(info, { format: format });
            } else {
                // 가장 높은 품질의 오디오 포맷 선택
                const format = audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
                console.log(`[MP3] Selected format: ${format.qualityLabel || format.audioQuality || 'default'}`);
                stream = ytdl.downloadFromInfo(info, { format: format });
            }
        } catch (streamError) {
            console.error(`[MP3] Failed to create stream:`, streamError);
            // 대체 방법: 직접 URL로 스트림 생성 시도
            try {
                console.log(`[MP3] Trying fallback method...`);
                stream = ytdl(url, { quality: 'lowestaudio', filter: 'audioonly' });
            } catch (fallbackError) {
                console.error(`[MP3] Fallback also failed:`, fallbackError);
                if (!res.headersSent) {
                    res.header('Access-Control-Allow-Origin', '*');
                    res.status(500).json({ error: streamError.message || "Failed to create stream" });
                }
                return;
            }
        }

        // 클라이언트 연결 종료 시 스트림 정리
        req.on('close', () => {
            console.log(`[MP3] Client disconnected`);
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        // 응답이 닫혔을 때 스트림 정리
        res.on('close', () => {
            console.log(`[MP3] Response closed`);
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        // 응답 헤더를 먼저 명시적으로 전송
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFileName)}.mp3"`,
            'Content-Type': 'audio/mpeg'
        });

        // 타임아웃 설정 (30분)
        res.setTimeout(1800000);

        // 스트림 데이터 전송 모니터링
        let bytesSent = 0;
        stream.on('data', (chunk) => {
            bytesSent += chunk.length;
            if (bytesSent === chunk.length) {
                console.log(`[MP3] First chunk sent: ${chunk.length} bytes`);
            }
        });

        stream.on('error', (error) => {
            console.error(`[MP3] Stream error:`, error);
            console.error(`[MP3] Error details:`, {
                message: error.message,
                code: error.code,
                statusCode: error.statusCode,
                response: error.response?.statusCode
            });
            
            if (!res.headersSent) {
                res.writeHead(500, {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({ 
                    error: error.message || "Stream error occurred",
                    code: error.code,
                    statusCode: error.statusCode
                }));
            } else if (!res.finished && !res.destroyed) {
                try {
                    res.end();
                } catch (e) {
                    console.error(`[MP3] Error ending response:`, e);
                }
            }
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        stream.on('end', () => {
            console.log(`[MP3] Stream ended. Total bytes sent: ${bytesSent}`);
            if (!res.finished && !res.destroyed) {
                res.end();
            }
        });

        // 스트림을 응답으로 파이핑
        console.log(`[MP3] Piping stream to response...`);
        stream.pipe(res);

    } catch (error) {
        console.error("[MP3] Error:", error);
        if (!res.headersSent) {
            res.header('Access-Control-Allow-Origin', '*');
            res.status(500).json({ error: error.message || "Internal server error" });
        } else if (!res.finished) {
            res.end();
        }
        // 스트림이 생성되었다면 정리
        if (stream) {
            stream.destroy();
        }
    }
});

app.get("/mp4", async (req, res) => {
    let stream = null;
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        console.log(`[MP4] Request received for URL: ${url}`);

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        console.log(`[MP4] Fetching video info...`);
        const info = await ytdl.getInfo(url);
        const videoName = info.videoDetails.title;
        
        // 파일명 안전하게 처리 (특수문자 제거)
        const safeFileName = videoName.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() || 'video';

        console.log(`[MP4] Video title: ${videoName}`);
        console.log(`[MP4] Starting download...`);

        // 스트림 생성 및 에러 핸들링
        // 이미 가져온 info를 사용하여 format 선택 후 스트림 생성 (403 오류 방지)
        try {
            const videoFormats = info.formats.filter(f => f.hasVideo);
            
            if (videoFormats.length === 0) {
                throw new Error('No video formats available');
            }

            // 가장 높은 품질의 비디오 포맷 선택
            const format = videoFormats.find(f => f.hasVideo && f.hasAudio) || videoFormats[0];
            
            console.log(`[MP4] Selected format: ${format.qualityLabel || 'default'}`);
            
            stream = ytdl.downloadFromInfo(info, {
                format: format
            });
        } catch (streamError) {
            console.error(`[MP4] Failed to create stream:`, streamError);
            if (!res.headersSent) {
                res.header('Access-Control-Allow-Origin', '*');
                res.status(500).json({ error: streamError.message || "Failed to create stream" });
            }
            return;
        }

        // 클라이언트 연결 종료 시 스트림 정리
        req.on('close', () => {
            console.log(`[MP4] Client disconnected`);
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        // 응답이 닫혔을 때 스트림 정리
        res.on('close', () => {
            console.log(`[MP4] Response closed`);
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        // 응답 헤더를 먼저 명시적으로 전송
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFileName)}.mp4"`,
            'Content-Type': 'video/mp4'
        });

        // 타임아웃 설정 (30분)
        res.setTimeout(1800000);

        // 스트림 데이터 전송 모니터링
        let bytesSent = 0;
        stream.on('data', (chunk) => {
            bytesSent += chunk.length;
            if (bytesSent === chunk.length) {
                console.log(`[MP4] First chunk sent: ${chunk.length} bytes`);
            }
        });

        stream.on('error', (error) => {
            console.error(`[MP4] Stream error:`, error);
            if (!res.headersSent) {
                res.writeHead(500, {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({ error: error.message || "Stream error occurred" }));
            } else if (!res.finished && !res.destroyed) {
                try {
                    res.end();
                } catch (e) {
                    console.error(`[MP4] Error ending response:`, e);
                }
            }
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        stream.on('end', () => {
            console.log(`[MP4] Stream ended. Total bytes sent: ${bytesSent}`);
            if (!res.finished && !res.destroyed) {
                res.end();
            }
        });

        // 스트림을 응답으로 파이핑
        console.log(`[MP4] Piping stream to response...`);
        stream.pipe(res);

    } catch (error) {
        console.error("[MP4] Error:", error);
        if (!res.headersSent) {
            res.header('Access-Control-Allow-Origin', '*');
            res.status(500).json({ error: error.message || "Internal server error" });
        } else if (!res.finished) {
            res.end();
        }
        // 스트림이 생성되었다면 정리
        if (stream) {
            stream.destroy();
        }
    }
});

// 전역 에러 핸들러
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// 프로세스 레벨 에러 핸들링
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(process.env.PORT || 3500, () => {
    console.log(`Server on port ${process.env.PORT || 3500}`);
});

// Railway를 위한 타임아웃 설정 (30분)
server.timeout = 1800000;
server.keepAliveTimeout = 1800000;
server.headersTimeout = 1800000;
