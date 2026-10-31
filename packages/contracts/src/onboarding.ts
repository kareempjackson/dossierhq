import { z } from 'zod';
import { timeZoneSchema } from './auth.js';
import { toolSchema } from './sources.js';

/** How many clients the MSP looks after, roughly. */
export const CLIENT_COUNTS = [
  '1-10',
  '11-25',
  '26-50',
  '51-100',
  '100+',
] as const;
export const clientCountSchema = z.enum(CLIENT_COUNTS);
export type ClientCount = z.infer<typeof clientCountSchema>;

/** How many people work at the MSP, roughly. */
export const TEAM_SIZES = ['1', '2-5', '6-15', '16-50', '50+'] as const;
export const teamSizeSchema = z.enum(TEAM_SIZES);
export type TeamSize = z.infer<typeof teamSizeSchema>;

/**
 * A company's own domain from whatever was typed: "https://www.Northwind.it/
 * about" is "northwind.it". Empty is null.
 */
export const websiteSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .transform((value) =>
    value
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/:\d+$/, '')
      .replace(/^www\./, ''),
  )
  .pipe(
    z.union([
      z.literal('').transform(() => null),
      z
        .string()
        .regex(
          /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
          'Enter a website like northwind.it',
        ),
    ]),
  );

/** What onboarding learns about the company beyond its name and time zone. */
export const workspaceProfileSchema = z.object({
  /** The company's own domain, e.g. "northwind.it". */
  website: z.string().nullable(),
  clientCount: clientCountSchema.nullable(),
  teamSize: teamSizeSchema.nullable(),
  /** The tools it uses that Dossier reads, to connect first. */
  tools: z.array(toolSchema),
  /** Others it named, as typed, e.g. "ConnectWise, IT Glue". */
  otherTools: z.string(),
});
export type WorkspaceProfile = z.infer<typeof workspaceProfileSchema>;

export const EMPTY_WORKSPACE_PROFILE: WorkspaceProfile = {
  website: null,
  clientCount: null,
  teamSize: null,
  tools: [],
  otherTools: '',
};

/** GET /onboarding: what's been saved so far, to pick up from. */
export const onboardingSchema = z.object({
  profile: z.object({ name: z.string(), title: z.string() }),
  /** Their email's domain, when it's a company's rather than a mail service's. */
  suggestedWebsite: z.string().nullable(),
  company: workspaceProfileSchema.extend({
    name: z.string(),
    timeZone: z.string(),
  }),
});
export type Onboarding = z.infer<typeof onboardingSchema>;

/** PUT /onboarding/profile: your name and what you do. */
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  title: z.string().trim().max(100).default(''),
});
export type ProfileUpdate = z.input<typeof profileUpdateSchema>;

/** PUT /onboarding/company: any of the company's details; the rest stay. */
export const companyUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your company’s name').max(100),
    timeZone: timeZoneSchema,
    website: websiteSchema,
    clientCount: clientCountSchema.nullable(),
    teamSize: teamSizeSchema.nullable(),
    tools: z
      .array(toolSchema)
      .max(10)
      .transform((tools) => [...new Set(tools)]),
    otherTools: z.string().trim().max(200, 'Keep it under 200 characters'),
  })
  .partial();
export type CompanyUpdate = z.input<typeof companyUpdateSchema>;
