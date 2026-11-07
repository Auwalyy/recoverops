import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { RequireExperience } from '@/components/guards';
import { useAuth } from '@/store/auth';
import type { AuthUser } from '@recoveros/shared';

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  firstName: 'Amina',
  lastName: 'Bello',
  preferredLanguage: 'en',
  kind: 'PATIENT',
  platformRoles: [],
  memberships: [],
  patientProfiles: [{ patientId: 'p1', hospitalId: 'h1', hospitalName: 'H' }],
  caregiverOf: [],
  permissions: ['recovery.read'],
  ...over,
});

function routes() {
  return {
    '(staff)/index': () => (
      <RequireExperience experience="STAFF">
        <Text>Staff dashboard</Text>
      </RequireExperience>
    ),
    '(patient)/index': () => (
      <RequireExperience experience="PATIENT">
        <Text>Patient home</Text>
      </RequireExperience>
    ),
    index: () => <Text>Entry</Text>,
    '(auth)/login': () => <Text>Login screen</Text>,
  };
}

describe('role-based navigation guards', () => {
  it('redirects signed-out users to login and never renders protected content', () => {
    useAuth.setState({ status: 'signedOut', user: null, actingAs: null });
    renderRouter(routes(), { initialUrl: '/(patient)' });
    expect(screen.queryByText('Patient home')).toBeNull();
    expect(screen.getByText('Login screen')).toBeTruthy();
  });

  it('a patient cannot render the staff experience', () => {
    useAuth.setState({ status: 'signedIn', user: user(), actingAs: 'PATIENT' });
    renderRouter(routes(), { initialUrl: '/(staff)' });
    expect(screen.queryByText('Staff dashboard')).toBeNull();
  });

  it('a patient sees the patient experience', () => {
    useAuth.setState({ status: 'signedIn', user: user(), actingAs: 'PATIENT' });
    renderRouter(routes(), { initialUrl: '/(patient)' });
    expect(screen.getByText('Patient home')).toBeTruthy();
  });
});
