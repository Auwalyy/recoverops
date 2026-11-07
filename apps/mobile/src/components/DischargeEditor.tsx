import { View } from 'react-native';
import type { DischargeContent } from '@recoveros/shared';
import { Badge, Button, Card, ChoiceChips, Row, Section, Text, TextField, YesNo } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { CheckInTemplate } from '@/types/models';

type Item = { title: string; details: string };
type Med = DischargeContent['medications'][number];
type ItemSection = 'clinicalInstructions' | 'woundCare' | 'activityRestrictions' | 'dietaryInstructions' | 'warningSigns' | 'rehabilitationRequirements' | 'education';

export const emptyContent = (): DischargeContent => ({
  summary: '',
  clinicalInstructions: [],
  medications: [],
  woundCare: [],
  activityRestrictions: [],
  dietaryInstructions: [],
  warningSigns: [],
  followUps: [],
  rehabilitationRequirements: [],
  education: [],
  activities: [],
  programmeDurationDays: 14,
});

const ITEM_SECTIONS: Array<{ key: ItemSection; title: string; placeholder: string }> = [
  { key: 'clinicalInstructions', title: 'Clinical instructions', placeholder: 'e.g. Rest at home for 7 days' },
  { key: 'warningSigns', title: 'Warning signs', placeholder: 'e.g. Fever of 38°C or higher' },
  { key: 'woundCare', title: 'Wound care', placeholder: 'e.g. Keep dressing dry for 48 hours' },
  { key: 'activityRestrictions', title: 'Activity restrictions', placeholder: 'e.g. No lifting over 5 kg for 4 weeks' },
  { key: 'dietaryInstructions', title: 'Diet', placeholder: 'e.g. Light meals, plenty of fluids' },
  { key: 'rehabilitationRequirements', title: 'Rehabilitation', placeholder: 'e.g. Physiotherapy twice weekly' },
  { key: 'education', title: 'Discharge education', placeholder: 'e.g. Wound care leaflet' },
];

function ItemList({ items, onChange, placeholder }: { items: Item[]; onChange: (v: Item[]) => void; placeholder: string }) {
  const { spacing } = useTheme();
  return (
    <View>
      {items.map((it, i) => (
        <Card key={i} tone="muted" style={{ marginBottom: spacing.sm }}>
          <TextField label="Title" value={it.title} onChangeText={(title) => onChange(items.map((x, j) => (j === i ? { ...x, title } : x)))} placeholder={placeholder} />
          <TextField label="Details" value={it.details} multiline onChangeText={(details) => onChange(items.map((x, j) => (j === i ? { ...x, details } : x)))} />
          <Button title="Remove" icon="trash-outline" variant="ghost" size="sm" fullWidth={false} onPress={() => onChange(items.filter((_, j) => j !== i))} />
        </Card>
      ))}
      <Button title="Add" icon="add" variant="outline" size="md" onPress={() => onChange([...items, { title: '', details: '' }])} />
    </View>
  );
}

function MedicationEditor({ med, onChange, onRemove }: { med: Med; onChange: (m: Med) => void; onRemove: () => void }) {
  const { spacing } = useTheme();
  const times = (med.schedule.timesOfDay ?? []).join(', ');
  return (
    <Card tone="muted" style={{ marginBottom: spacing.sm }}>
      <TextField label="Medicine name" value={med.name} onChangeText={(name) => onChange({ ...med, name })} />
      <Row gap={spacing.sm}>
        <View style={{ flex: 1 }}>
          <TextField label="Strength" value={med.strength ?? ''} onChangeText={(strength) => onChange({ ...med, strength: strength || undefined })} placeholder="500mg" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Dose" value={med.dose} onChangeText={(dose) => onChange({ ...med, dose })} placeholder="2 tablets" />
        </View>
      </Row>
      <Text variant="label" style={{ marginBottom: spacing.sm }}>
        Route
      </Text>
      <ChoiceChips label="Route" value={med.route} onChange={(route) => onChange({ ...med, route })} options={(['ORAL', 'TOPICAL', 'INHALED', 'SUBCUTANEOUS', 'INTRAMUSCULAR', 'OTHER'] as const).map((r) => ({ value: r, label: r.charAt(0) + r.slice(1).toLowerCase() }))} />
      <View style={{ height: spacing.md }} />
      <TextField label="Frequency (prescriber wording)" value={med.frequencyText} onChangeText={(frequencyText) => onChange({ ...med, frequencyText })} placeholder="Three times daily after meals" />
      <Text variant="label" style={{ marginBottom: spacing.sm }}>
        As needed (PRN)? No reminders are scheduled for PRN medicines.
      </Text>
      <YesNo label="PRN" value={med.isPrn} onChange={(isPrn) => onChange({ ...med, isPrn })} />
      <View style={{ height: spacing.md }} />
      {!med.isPrn ? (
        <Row gap={spacing.sm}>
          <View style={{ flex: 2 }}>
            <TextField
              label="Reminder times (24h)"
              value={times}
              onChangeText={(t) => onChange({ ...med, schedule: { ...med.schedule, kind: 'DAILY', timesOfDay: t.split(/[,\s]+/).filter(Boolean) } })}
              placeholder="08:00, 14:00, 20:00"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Days" keyboardType="number-pad" value={med.schedule.durationDays ? String(med.schedule.durationDays) : ''} onChangeText={(d) => onChange({ ...med, schedule: { ...med.schedule, durationDays: d ? Number(d) : undefined } })} placeholder="7" />
          </View>
        </Row>
      ) : null}
      <TextField label="Additional instructions" value={med.instructions ?? ''} multiline onChangeText={(instructions) => onChange({ ...med, instructions: instructions || undefined })} />
      <Button title="Remove medicine" icon="trash-outline" variant="ghost" size="sm" fullWidth={false} onPress={onRemove} />
    </Card>
  );
}

/** Structured discharge-plan editor. Content is validated server-side against the shared schema. */
export function DischargeEditor({ value, onChange, templates }: { value: DischargeContent; onChange: (v: DischargeContent) => void; templates: CheckInTemplate[] }) {
  const { spacing } = useTheme();
  const set = <K extends keyof DischargeContent>(k: K, v: DischargeContent[K]) => onChange({ ...value, [k]: v });
  return (
    <View>
      <TextField label="Discharge summary" value={value.summary} multiline onChangeText={(summary) => set('summary', summary)} />
      <TextField label="Programme duration (days)" keyboardType="number-pad" value={String(value.programmeDurationDays)} onChangeText={(d) => set('programmeDurationDays', Math.max(1, Number(d) || 1))} />

      <Section title="Medicines (from the prescription)">
        {value.medications.map((m, i) => (
          <MedicationEditor key={i} med={m} onChange={(nm) => set('medications', value.medications.map((x, j) => (j === i ? nm : x)))} onRemove={() => set('medications', value.medications.filter((_, j) => j !== i))} />
        ))}
        <Button
          title="Add medicine"
          icon="add"
          variant="outline"
          size="md"
          onPress={() => set('medications', [...value.medications, { name: '', dose: '', route: 'ORAL', frequencyText: '', isPrn: false, schedule: { kind: 'DAILY', timesOfDay: ['08:00'] } }])}
        />
      </Section>

      {ITEM_SECTIONS.map((s) => (
        <Section key={s.key} title={s.title}>
          <ItemList items={value[s.key]} onChange={(items) => set(s.key, items)} placeholder={s.placeholder} />
        </Section>
      ))}

      <Section title="Daily check-in">
        {templates.length ? (
          <ChoiceChips
            label="Check-in template"
            value={value.checkInTemplateId ?? 'none'}
            onChange={(id) => onChange({ ...value, checkInTemplateId: id === 'none' ? undefined : id, checkInSchedule: id === 'none' ? undefined : { kind: 'DAILY', timesOfDay: ['09:00'] } })}
            options={[{ value: 'none', label: 'No check-ins' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
          />
        ) : (
          <Badge label="No approved check-in templates" tone="warning" />
        )}
        {value.checkInTemplateId ? (
          <View style={{ marginTop: spacing.md }}>
            <TextField
              label="Check-in time(s)"
              value={(value.checkInSchedule?.timesOfDay ?? ['09:00']).join(', ')}
              onChangeText={(t) => onChange({ ...value, checkInSchedule: { kind: 'DAILY', timesOfDay: t.split(/[,\s]+/).filter(Boolean) } })}
            />
          </View>
        ) : null}
      </Section>
    </View>
  );
}
