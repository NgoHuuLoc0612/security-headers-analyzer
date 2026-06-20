// apps/api/src/database/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SAMPLE_DOMAINS = [
  { domain: 'github.com', url: 'https://github.com', score: 92, grade: 'A' },
  { domain: 'mozilla.org', url: 'https://mozilla.org', score: 96, grade: 'A+' },
  { domain: 'cloudflare.com', url: 'https://cloudflare.com', score: 94, grade: 'A' },
  { domain: 'stripe.com', url: 'https://stripe.com', score: 90, grade: 'A' },
  { domain: 'example-insecure.com', url: 'https://example-insecure.com', score: 35, grade: 'E' },
];

async function main() {
  console.log('🌱 Seeding database...');

  for (const sample of SAMPLE_DOMAINS) {
    const correlationId = `seed-${sample.domain}-${Date.now()}`;

    const analysis = await prisma.analysis.create({
      data: {
        correlationId,
        url: sample.url,
        domain: sample.domain,
        finalUrl: sample.url,
        statusCode: 200,
        duration: Math.floor(Math.random() * 3000) + 500,
        overallScore: sample.score,
        grade: sample.grade,
        headersScore: sample.score * 0.9,
        tlsScore: sample.score * 1.05,
        cspScore: sample.score * 0.85,
        cookiesScore: sample.score * 0.95,
        dnsScore: sample.score * 0.8,
        reputationScore: 95,
        xssRisk: sample.score > 80 ? 'low' : 'high',
        clickjackingRisk: sample.score > 80 ? 'low' : 'medium',
        mitmRisk: sample.score > 80 ? 'low' : 'critical',
        http2Enabled: true,
        http3Enabled: Math.random() > 0.5,
        serverTech: ['nginx'],
        ttfb: Math.floor(Math.random() * 200) + 50,
        tlsGrade: sample.grade,
        hstsEnabled: sample.score > 50,
        hstsMaxAge: 31536000,
        heartbleed: false,
        poodle: false,
        vtMalicious: 0,
        vtReputation: 50,
        vtThreatNames: [],
      },
    });

    await prisma.domainCache.upsert({
      where: { domain: sample.domain },
      create: {
        domain: sample.domain,
        lastAnalyzed: new Date(),
        scanCount: 1,
        bestScore: sample.score,
        bestGrade: sample.grade,
        worstScore: sample.score,
        avgScore: sample.score,
        trending: 'stable',
      },
      update: {},
    });

    console.log(`  ✓ Created analysis for ${sample.domain} (${analysis.id})`);
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
