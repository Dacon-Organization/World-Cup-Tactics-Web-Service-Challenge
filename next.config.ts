import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 외부 요청 0건 원칙(C1) — 이미지 최적화 원격 패턴을 두지 않는다.
  // 모든 시각 요소는 자체 SVG이므로 원격 이미지 소스가 존재하지 않는다.
  images: {
    remotePatterns: [],
  },
  eslint: {
    dirs: ['src', 'scripts'],
  },
};

export default nextConfig;
