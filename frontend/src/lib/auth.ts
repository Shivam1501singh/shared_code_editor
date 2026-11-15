import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GithubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                scope: 'read:user user:email',
              },
            },
            async profile(profile, tokens) {
              let email = profile.email;

              // If primary email is hidden / private on GitHub, fetch verified email from GitHub API
              if (!email && tokens.access_token) {
                try {
                  const res = await fetch('https://api.github.com/user/emails', {
                    headers: {
                      Authorization: `Bearer ${tokens.access_token}`,
                      'User-Agent': 'SynCode-App',
                    },
                  });
                  if (res.ok) {
                    const emails = await res.json();
                    if (Array.isArray(emails)) {
                      const primary =
                        emails.find((e: any) => e.primary && e.verified) ||
                        emails.find((e: any) => e.primary) ||
                        emails[0];
                      if (primary?.email) {
                        email = primary.email;
                      }
                    }
                  }
                } catch (err) {
                  console.error('Failed to fetch private GitHub email:', err);
                }
              }

              return {
                id: profile.id.toString(),
                name: profile.name || profile.login || 'GitHub Developer',
                email: email || `${profile.login}@users.noreply.github.com`,
                image: profile.avatar_url,
              };
            },
          }),
        ]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      } else if (!token.id && token.sub) {
        token.id = token.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id || token.sub) as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};
