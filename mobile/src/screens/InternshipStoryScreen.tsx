/**
 * Global GAOEX internship story — parallax hero, scroll-triggered sections, editorial layout.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { colors, spacing, typography, borderRadius, shadows } from '../constants/theme';
import StoryImageSlot from '../components/story/StoryImageSlot';
import { storyImageUri } from '../features/internshipStoryImages';
import {
  AnimatedStoryDivider,
  HeroBackdropOrb,
  HeroParallaxImage,
  HeroScrollHint,
  HeroSecondaryParallax,
  ParallaxInlineImage,
  StoryProgressBar,
  StoryScrollProvider,
  StorySection,
  StaggerItem,
  useStoryScrollSetup,
} from '../components/story/StoryMotion';

const PARTNER_ORGANIZATIONS = [
  'Jubilee Foundation USA',
  'Sweet Aroma Foundation',
  'Proverbs 22:6 USA',
  'DIET India',
  'Don Bosco India',
  'Kalam Foundation India',
];

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <View style={styles.sectionTitleBlock}>
      <Text style={styles.sectionKicker}>{kicker}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Pillar({
  name,
  body,
  staggerIndex,
}: {
  name: string;
  body: string;
  staggerIndex?: number;
}) {
  const inner = (
    <View style={styles.pillar}>
      <Text style={styles.pillarName}>{name}</Text>
      <Text style={styles.pillarBody}>{body}</Text>
    </View>
  );
  if (staggerIndex === undefined) return inner;
  return <StaggerItem index={staggerIndex}>{inner}</StaggerItem>;
}

function RegionBlock({
  place,
  body,
}: {
  place: string;
  body: string;
}) {
  return (
    <View style={styles.regionBlock}>
      <Text style={styles.regionName}>{place}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

function StatGrid({ items }: { items: { value: string; label: string }[] }) {
  return (
    <View style={styles.statGrid}>
      {items.map((row, i) => (
        <StaggerItem key={`${row.label}-${i}`} index={i} style={styles.statCardWrap}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{row.value}</Text>
            <Text style={styles.statLabel}>{row.label}</Text>
          </View>
        </StaggerItem>
      ))}
    </View>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((line, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>●</Text>
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Frosted read panel over hero imagery without native BlurView (avoids unlinked ExpoBlurView / red error overlay).
 * Layered gradients approximate glass: dark base + soft top highlight.
 */
function HeroFrostedTextPanel({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.heroTextCard}>
      <LinearGradient
        colors={['rgba(22,22,30,0.88)', 'rgba(10,10,16,0.96)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.04)', 'transparent']}
        locations={[0, 0.22, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={styles.heroTextBlock}>{children}</View>
    </View>
  );
}

export default function InternshipStoryScreen() {
  const { value, scrollHandler, trackW, progressStyle } = useStoryScrollSetup();

  return (
    <View style={styles.screen}>
      <StoryScrollProvider value={value}>
        <StoryProgressBar topInset={0} trackW={trackW} progressStyle={progressStyle} />

        <Animated.ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          onLayout={e => {
            value.viewportH.value = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, h) => {
            value.contentH.value = h;
          }}
        >
          {/* ── Hero ───────────────────────────────── */}
          <LinearGradient
            colors={[colors.backgroundTertiary, colors.background, colors.background]}
            locations={[0, 0.45, 1]}
            style={styles.heroGradient}
          >
            <View style={styles.heroScene}>
              <HeroBackdropOrb />
              <HeroParallaxImage style={styles.heroImageParallax}>
                <StoryImageSlot variant="hero" label="Hero — GAOEX mission & communities" source={storyImageUri('heroMission')} />
              </HeroParallaxImage>
            </View>

            <HeroFrostedTextPanel>
              <Text style={styles.heroTitle}>Global Academy of Excellence</Text>
              <Text style={styles.heroLead}>
                Empowering rural communities through education, research, and global collaboration.
              </Text>
              <Text style={styles.bodyHero}>
                Across India, Africa, and the USA, GAOEX creates opportunities for students and educators through
                transformative programs that combine curriculum, technology, leadership, and real-world skill development.
              </Text>
            </HeroFrostedTextPanel>

            <HeroSecondaryParallax style={styles.heroSecondaryImage}>
              <StoryImageSlot variant="feature" label="Global reach — programs & collaboration" source={storyImageUri('globalReach')} style={styles.heroSecondarySlot} />
            </HeroSecondaryParallax>

            <HeroScrollHint>
              <View style={styles.scrollHint}>
                <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                <Text style={styles.scrollHintText}>Scroll to explore</Text>
              </View>
            </HeroScrollHint>
          </LinearGradient>

          {/* ── Section 1 ───────────────────────────── */}
          <StorySection>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 1" title="What is GAOEX?" />
            <Text style={styles.body}>
              GAOEX is an ISO-certified educational organization and nonprofit focused on making education more inclusive,
              practical, and future-ready for rural and underserved communities. Its work brings together research-driven
              learning, digital empowerment, technology integration, and global collaboration to help students and educators
              grow in a changing world.
            </Text>
            <ParallaxInlineImage strength={26}>
              <StoryImageSlot variant="inline" label="Education in action" source={storyImageUri('educationInAction')} style={styles.sectionImage} />
            </ParallaxInlineImage>

            <Pillar
              staggerIndex={0}
              name="Education"
              body="Programs designed to strengthen literacy, numeracy, learning skills, STEM understanding, and long-term academic growth."
            />
            <Pillar
              staggerIndex={1}
              name="Research"
              body="Educational research projects, evaluation initiatives, and real-world learning experiences that improve programs and expand impact."
            />
            <ParallaxInlineImage strength={18}>
              <StoryImageSlot variant="compact" label="Research & evaluation" source={storyImageUri('researchEvaluation')} style={styles.sectionImage} />
            </ParallaxInlineImage>
            <Pillar
              staggerIndex={2}
              name="Global Collaboration"
              body="Cross-border partnerships and student-led initiatives that connect local communities to wider opportunities, ideas, and support networks."
            />
            <ParallaxInlineImage strength={20}>
              <StoryImageSlot variant="feature" label="Partnerships worldwide" source={storyImageUri('partnershipsWorldwide')} style={styles.sectionImageTight} />
            </ParallaxInlineImage>
          </StorySection>

          {/* ── Section 2 ───────────────────────────── */}
          <StorySection band>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 2" title="Where GAOEX Works" />
            <Text style={styles.body}>
              GAOEX serves communities across India, Africa, and the USA, building programs that connect local educational
              needs with global opportunity.
            </Text>
            <ParallaxInlineImage strength={32}>
              <StoryImageSlot variant="hero" label="Regions map / footprint" source={storyImageUri('regionsFootprint')} style={styles.sectionImage} />
            </ParallaxInlineImage>

            <RegionBlock
              place="India"
              body={"GAOEX's educational work in India includes partnerships with government and government-aided schools, colleges, orphanages, rehabilitation centres, and open shelter homes, with programs spanning 10 districts in Tamil Nadu."}
            />
            <ParallaxInlineImage strength={20}>
              <StoryImageSlot variant="inline" label="India programs" source={storyImageUri('indiaPrograms')} style={styles.sectionImage} />
            </ParallaxInlineImage>
            <RegionBlock
              place="Africa"
              body="In Africa, GAOEX supports rural and boarding schools through partnerships and outreach, including in Kenya and Uganda."
            />
            <RegionBlock
              place="USA"
              body="In the USA, GAOEX supports student leadership, internships, community outreach, and programs for young people, including children affected by parental incarceration."
            />
            <StoryImageSlot variant="compact" label="USA student leadership" source={storyImageUri('usaLeadership')} style={styles.sectionImageTight} />
          </StorySection>

          {/* ── Section 3 ───────────────────────────── */}
          <StorySection>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 3" title="Who GAOEX Serves" />
            <Text style={styles.body}>
              GAOEX works with the people and communities that often have the most to gain from meaningful educational support
              and opportunity.
            </Text>
            <ParallaxInlineImage strength={24}>
              <StoryImageSlot variant="feature" label="Students & educators" source={storyImageUri('studentsEducators')} style={styles.sectionImage} />
            </ParallaxInlineImage>

            <Pillar
              staggerIndex={0}
              name="Students"
              body="GAOEX serves high school and college students through academic programs, internships, workshops, leadership development, and profile-building opportunities."
            />
            <Pillar
              staggerIndex={1}
              name="Educators"
              body="Teachers, school leaders, and trainers receive support through capacity-building programs focused on technology, AI, media literacy, soft skills, and classroom innovation."
            />
            <Pillar
              staggerIndex={2}
              name="Schools and Institutions"
              body="GAOEX works with government schools, government-aided schools, autonomous colleges, government colleges, and other educational institutions."
            />
            <Pillar
              staggerIndex={3}
              name="Underserved Communities"
              body="Its work also reaches orphanages, rehabilitation centres, open shelter homes, rural schools, boarding schools, and children impacted by parental incarceration."
            />
          </StorySection>

          {/* ── Section 4 ───────────────────────────── */}
          <StorySection>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 4" title="What GAOEX Does" />
            <Text style={styles.body}>
              GAOEX builds educational ecosystems that go beyond the classroom. Its work spans curriculum support, workshops,
              internships, leadership, research, and community outreach.
            </Text>
            <ParallaxInlineImage strength={18}>
              <StoryImageSlot variant="inline" label="Programs overview" source={storyImageUri('programsOverview')} style={styles.sectionImage} />
            </ParallaxInlineImage>

            <Text style={styles.subheading}>Curriculum-Based Programs</Text>
            <Text style={styles.body}>
              GAOEX runs structured learning programs such as Abacus, Advanced Mental Math Skills, and Spelling Bee, along with
              student action projects, competitions, and educational evaluation initiatives. These programs are designed to
              strengthen core academic skills while building confidence and measurable progress.
            </Text>
            <StoryImageSlot variant="feature" label="Curriculum & competitions" source={storyImageUri('curriculumCompetitions')} style={styles.sectionImage} />

            <Text style={styles.subheading}>Workshops for Students</Text>
            <Text style={styles.body}>
              Workshop programs introduce students to AI tools, leadership, communication, career counselling, job etiquette,
              interview skills, and 21st-century workplace readiness. These experiences are meant to make learning practical,
              relevant, and future-focused.
            </Text>
            <StoryImageSlot variant="compact" label="Student workshops" source={storyImageUri('studentWorkshops')} style={styles.sectionImageTight} />

            <Text style={styles.subheading}>Teacher Capacity Building</Text>
            <Text style={styles.body}>
              GAOEX supports educators through training in AI literacy, Microsoft tools, media literacy, digital filmmaking, soft
              skills, and language development. The goal is to help teachers bring stronger, more modern learning experiences
              into their classrooms.
            </Text>

            <Text style={styles.subheading}>Internships and Higher Education</Text>
            <Text style={styles.body}>
              GAOEX offers high school internships, college internships, UG/PG/post-doctorate research opportunities, profile
              building, scholarship recommendation support, and career-readiness programming. These experiences are built to
              help students grow academically and professionally.
            </Text>
            <ParallaxInlineImage strength={22}>
              <StoryImageSlot variant="portrait" label="Interns & higher education" source={storyImageUri('internsHigherEd')} style={styles.sectionImage} />
            </ParallaxInlineImage>

            <Text style={styles.subheading}>Leadership and Outreach</Text>
            <Text style={styles.body}>
              Through programs such as the Educational Research Team, Global Student Ambassador Program, and Youth Leadership
              Summit, GAOEX encourages advocacy, collaboration, service, and youth-led change.
            </Text>
          </StorySection>

          {/* ── Section 5 ───────────────────────────── */}
          <StorySection band>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 5" title="Why Interns Matter" />
            <Text style={styles.body}>
              {
                "GAOEX's internship model is built around meaningful student contribution. Its USA internship approach is \"For the Students, By the Students,\" reflecting a culture of student leadership, mentorship, and shared impact."
              }
            </Text>
            <ParallaxInlineImage strength={30}>
              <StoryImageSlot variant="hero" label="Internship culture" source={storyImageUri('internshipCulture')} style={styles.sectionImage} />
            </ParallaxInlineImage>
            <Text style={styles.body}>
              {
                "Interns help support programs, outreach, educational initiatives, and community-facing projects that strengthen GAOEX's mission across regions. They are part of the work, part of the growth, and part of the impact."
              }
            </Text>

            <View style={styles.triad}>
              <Pillar
                staggerIndex={0}
                name="Learn"
                body="Build real skills in communication, leadership, research, collaboration, and professional readiness."
              />
              <Pillar
                staggerIndex={1}
                name="Contribute"
                body="Support projects that serve students, educators, and communities in meaningful ways."
              />
              <Pillar
                staggerIndex={2}
                name="Lead"
                body="Grow into leadership through teamwork, initiative, advocacy, and student-driven action."
              />
            </View>
          </StorySection>

          {/* ── Section 6 ───────────────────────────── */}
          <StorySection>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 6" title="Impact" />
            <Text style={styles.body}>
              {"GAOEX's work is backed by measurable reach across programs, institutions, and student communities."}
            </Text>
            <ParallaxInlineImage strength={20}>
              <StoryImageSlot variant="inline" label="Impact at a glance" source={storyImageUri('impactAtGlance')} style={styles.sectionImage} />
            </ParallaxInlineImage>

            <Text style={styles.subheading}>India Impact</Text>
            <StatGrid
              items={[
                { value: '650+', label: 'educators trained' },
                { value: '350+', label: 'schools reached' },
                { value: '10+', label: 'districts in Tamil Nadu' },
                { value: '25,000', label: 'students impacted' },
              ]}
            />

            <Text style={styles.subheading}>Student Program Reach</Text>
            <BulletList
              items={[
                '1,350 rural students reached through introductory AI programming in 2024',
                '200+ students in AI for Students programs in India',
                '500+ students reached through leadership training in 2024',
              ]}
            />
            <StoryImageSlot variant="compact" label="Student reach" source={storyImageUri('studentReach')} style={styles.sectionImageTight} />

            <Text style={styles.subheading}>Teacher and Program Development</Text>
            <BulletList
              items={[
                '270+ global technology trainings',
                '125+ AI for Educators sessions at Cluny',
                '50+ AI for Educators sessions led by U.S. students',
                '25+ Robotics Without Coding workshops',
              ]}
            />

            <Text style={styles.subheading}>USA Internship Ecosystem</Text>
            <StatGrid
              items={[
                { value: '3+', label: 'years sustained growth' },
                { value: '150+', label: 'interns' },
                { value: '1,500+', label: 'volunteering hours' },
                { value: '10+', label: 'major projects' },
                { value: '95%', label: 'continuation 2025→2026' },
                { value: '70+', label: 'interns in 2026' },
              ]}
            />
          </StorySection>

          {/* ── Section 7 ───────────────────────────── */}
          <StorySection>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 7" title="Partners and Collaboration" />
            <Text style={styles.body}>
              GAOEX works with organizations that strengthen its educational reach, community impact, and international
              collaboration.
            </Text>

            <BulletList items={PARTNER_ORGANIZATIONS} />

            <Text style={styles.body}>
              Together, these partnerships help GAOEX connect students, educators, and communities to wider resources,
              stronger programs, and broader opportunity.
            </Text>
          </StorySection>

          {/* ── Section 8 ───────────────────────────── */}
          <StorySection band>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 8" title="Recognition and Credibility" />
            <Text style={styles.body}>
              GAOEX is an ISO-certified educational organization and 5-star Google GMB rated organization. Its work has also
              received multiple recognitions across education and research.
            </Text>
            <StoryImageSlot variant="feature" label="Awards & recognition" source={storyImageUri('awardsRecognition')} style={styles.sectionImage} />

            <BulletList
              items={[
                'Asian Education Award (2022)',
                'Indian Glory Award (2023)',
                'Indian ICON Awards (2024, 2025)',
                'Best NGO of the Year (2023)',
                'MSME Best Institute Award (2024)',
              ]}
            />

            <Text style={styles.body}>
              Under the leadership of Founder and CEO Prashitha G, GAOEX is an organization committed to educational innovation,
              service, and long-term community impact.
            </Text>
            <StoryImageSlot variant="portrait" label="Leadership" source={storyImageUri('leadership')} style={styles.portraitCentered} />
          </StorySection>

          {/* ── Section 9 ───────────────────────────── */}
          <StorySection>
            <AnimatedStoryDivider />
            <SectionTitle kicker="Section 9" title="Guided by Global and National Education Goals" />
            <Text style={styles.body}>
              GAOEX aligns its work with broader educational frameworks including UNESCO, SDG 4, NEP 2020, and Tamil Nadu State
              Education Policy 2025. That alignment is tied to inclusion, equitable access, digital literacy, teacher
              development, and future-ready learning.
            </Text>
            <ParallaxInlineImage strength={16}>
              <StoryImageSlot variant="inline" label="Policy alignment" source={storyImageUri('policyAlignment')} style={styles.sectionImage} />
            </ParallaxInlineImage>
            <Text style={styles.body}>
              This means the organization’s work is not only community-centered, but also shaped by larger goals around quality
              education, opportunity, and long-term social progress.
            </Text>
          </StorySection>

          {/* ── Closing ─────────────────────────────── */}
          <StorySection finale>
            <AnimatedStoryDivider />
            <LinearGradient colors={[colors.backgroundModifier, colors.backgroundSecondary]} style={styles.closingCard}>
              <Text style={styles.closingTitle}>{"You're now part of the mission."}</Text>
              <Text style={styles.closingBody}>
                {
                  "InternHub is where interns connect, collaborate, and contribute to the work behind GAOEX's impact. Use this space to learn, build, communicate, and help move meaningful projects forward."
                }
              </Text>
              <Text style={styles.closingTagline}>Connect. Collaborate. Create Impact.</Text>
            </LinearGradient>
          </StorySection>

          <View style={styles.bottomSpacer} />
        </Animated.ScrollView>
      </StoryScrollProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: spacing.xxxl * 2,
  },
  heroGradient: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  heroScene: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
  },
  heroImageParallax: {
    marginBottom: 0,
    ...shadows.md,
  },
  heroTextCard: {
    marginTop: -spacing.xl,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    overflow: 'hidden',
    zIndex: 2,
    ...shadows.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border + '99',
  },
  heroTextBlock: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg + spacing.xs,
    paddingBottom: spacing.lg,
  },
  heroSecondaryImage: {
    marginTop: spacing.lg,
  },
  heroSecondarySlot: {
    marginTop: 0,
  },
  heroTitle: {
    fontSize: typography.fontSize.display,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    lineHeight: typography.fontSize.display * typography.lineHeight.tight,
  },
  heroLead: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.xl * typography.lineHeight.relaxed,
  },
  bodyHero: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.md * typography.lineHeight.relaxed,
  },
  body: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.md * typography.lineHeight.relaxed,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  subheading: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  scrollHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  scrollHintText: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0.5,
  },
  sectionTitleBlock: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionKicker: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    lineHeight: typography.fontSize.xxxl * typography.lineHeight.tight,
  },
  sectionImage: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  sectionImageTight: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  pillar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillarName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  pillarBody: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.md * typography.lineHeight.relaxed,
  },
  regionBlock: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  regionName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  triad: {
    marginTop: spacing.sm,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCardWrap: {
    width: '47%',
  },
  statCard: {
    width: '100%',
    padding: spacing.md,
    backgroundColor: colors.highlightBg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.primaryLight,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },
  bulletList: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bulletDot: {
    fontSize: 8,
    color: colors.primary,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.md * typography.lineHeight.relaxed,
  },
  portraitCentered: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    maxWidth: 280,
    alignSelf: 'center',
  },
  closingCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.xxl,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.lg,
  },
  closingTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  closingBody: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.md * typography.lineHeight.relaxed,
  },
  closingTagline: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.accent,
    marginTop: spacing.sm,
    letterSpacing: 0.3,
  },
  bottomSpacer: {
    height: spacing.xxxl,
  },
});
