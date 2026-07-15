import { PageContainer } from '@/components/layout/PageContainer';
import { SettingsNav } from './settings/SettingsNav';
import { ProfileSection } from './settings/ProfileSection';
import { AiProvidersSection } from './settings/AiProvidersSection';
import { AppearanceSection } from './settings/AppearanceSection';
import { SecuritySection } from './settings/SecuritySection';

export default function Settings() {
  return (
    <PageContainer width="content">
      <div className="mb-6 sm:mb-7">
        <h1 className="text-page-title mb-1">Settings</h1>
        <p className="text-body text-(--muted-foreground)">
          Manage your account and appearance
        </p>
      </div>

      <div className="lg:flex lg:items-start lg:gap-8">
        <SettingsNav />
        <div className="min-w-0 flex-1 space-y-4 sm:space-y-6">
          <ProfileSection />
          <AiProvidersSection />
          <AppearanceSection />
          <SecuritySection />
        </div>
      </div>
    </PageContainer>
  );
}
