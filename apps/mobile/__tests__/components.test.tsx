import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Button, ScaleSelector } from '@/components/ui';
import { SafetyMessages, TaskRow } from '@/components/patient';
import { CheckInForm } from '@/components/CheckInForm';
import type { Task } from '@/types/models';

const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;

describe('UI components', () => {
  it('Button fires onPress and exposes an accessible label', () => {
    const onPress = jest.fn();
    render(<Button title="Sign in" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Sign in'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled Button does not fire', () => {
    const onPress = jest.fn();
    render(<Button title="Submit" disabled onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Submit'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('ScaleSelector reports the chosen value', () => {
    const onChange = jest.fn();
    render(<ScaleSelector label="Pain" value={undefined} onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('7'));
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('TaskRow shows the activity and offers completion for pending tasks', () => {
    const onComplete = jest.fn();
    const task: Task = { id: 't1', episodeId: 'e1', type: 'WOUND_CARE', title: 'Check your wound', dueAt: new Date(Date.now() + 3600_000).toISOString(), localDate: '2026-11-07', localTime: '18:00', status: 'PENDING' };
    render(<TaskRow task={task} onComplete={onComplete} />);
    expect(screen.getByText('Check your wound')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Mark Check your wound as done'));
    expect(onComplete).toHaveBeenCalled();
  });

  it('SafetyMessages shows emergency guidance immediately', () => {
    render(wrap(<SafetyMessages messages={[{ priority: 'HIGH', message: 'Your care team has been alerted.', showEmergencyGuidance: true, emergencyInstructions: 'Go to the nearest emergency department.', emergencyPhone: '+2348000000112' }]} />));
    expect(screen.getByText('Go to the nearest emergency department.')).toBeTruthy();
    expect(screen.getByText('Your care team has been alerted.')).toBeTruthy();
    expect(screen.getByLabelText('Call +2348000000112')).toBeTruthy();
  });

  it('CheckInForm renders template questions and blocks submission until required answers are given', () => {
    render(
      wrap(
        <CheckInForm
          episodeId="e1"
          onDone={jest.fn()}
          template={{ id: 'tpl', name: 'Daily', kind: 'GENERAL', version: 1, questions: [{ key: 'pain_score', type: 'SCALE', label: 'Pain today', required: true, min: 0, max: 10 }, { key: 'fever', type: 'BOOLEAN', label: 'Fever?', required: true }] }}
        />,
      ),
    );
    expect(screen.getByText('Pain today')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Submit'));
    expect(screen.getAllByText('Please answer this question')).toHaveLength(2);
  });
});
