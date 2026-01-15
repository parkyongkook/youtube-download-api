# YouTube Download API 테스트 URL

## 테스트 대상 비디오
- URL: https://www.youtube.com/watch?v=5gxAhqFpePI&list=RDtPn2n00uvUI&index=2
- 제목: [DJ Triple Crown] I'd Like to Teach the World to Sing - Gordon Webster

## 테스트 URL 목록

### 1. 정보 조회 (Info)
```
https://youtube-download-api-production-2067.up.railway.app/info?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D5gxAhqFpePI%26list%3DRDtPn2n00uvUI%26index%3D2
```

### 2. MP3 다운로드
```
https://youtube-download-api-production-2067.up.railway.app/mp3?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D5gxAhqFpePI%26list%3DRDtPn2n00uvUI%26index%3D2
```

### 3. MP4 다운로드
```
https://youtube-download-api-production-2067.up.railway.app/mp4?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D5gxAhqFpePI%26list%3DRDtPn2n00uvUI%26index%3D2
```

## 테스트 방법

### 브라우저에서 테스트
1. 위 URL을 브라우저 주소창에 붙여넣기
2. 다운로드가 시작되는지 확인
3. 개발자 도구(F12) → Network 탭에서 응답 헤더 확인

### curl로 테스트 (헤더만 확인)
```bash
curl -I "https://youtube-download-api-production-2067.up.railway.app/info?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D5gxAhqFpePI%26list%3DRDtPn2n00uvUI%26index%3D2"
```

### JavaScript fetch로 테스트
```javascript
// Info 테스트
fetch('https://youtube-download-api-production-2067.up.railway.app/info?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D5gxAhqFpePI%26list%3DRDtPn2n00uvUI%26index%3D2')
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));

// MP3 다운로드 테스트
fetch('https://youtube-download-api-production-2067.up.railway.app/mp3?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D5gxAhqFpePI%26list%3DRDtPn2n00uvUI%26index%3D2')
  .then(res => {
    if (res.ok) {
      return res.blob();
    }
    throw new Error('Download failed');
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'video.mp3';
    a.click();
  })
  .catch(err => console.error(err));
```
