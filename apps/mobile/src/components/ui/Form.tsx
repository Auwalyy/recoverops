import { forwardRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH_TARGET } from '@/theme/tokens';
import { Text } from './Text';

interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  secure?: boolean;
}

export const TextField = forwardRef<ComponentRef<typeof TextInput>, FieldProps>(function TextField({ label, error, hint, icon, secure, style, multiline, ...rest }, ref) {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text variant="label" style={{ marginBottom: spacing.xs }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: multiline ? 112 : TOUCH_TARGET + 4,
          borderWidth: focused ? 1.5 : 1,
          borderColor,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.md,
        }}
      >
        {icon ? <Ionicons name={icon} size={20} color={colors.textSecondary} style={{ marginRight: spacing.sm, marginTop: multiline ? 14 : 0 }} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[typography.body, { flex: 1, color: colors.text, paddingVertical: multiline ? 12 : 0 }, style]}
          {...rest}
        />
        {secure ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} onPress={() => setHidden((h) => !h)} style={{ padding: 8 }}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert" style={{ marginTop: spacing.xs }}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/** react-hook-form bound text field. */
export function FormField<T extends FieldValues>({ control, name, ...props }: Omit<FieldProps, 'value' | 'onChangeText'> & { control: Control<T>; name: Path<T> }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField {...props} value={field.value == null ? '' : String(field.value)} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
      )}
    />
  );
}

/** Single-choice chips (large, accessible). */
export function ChoiceChips<V extends string>({ options, value, onChange, label }: { options: Array<{ value: V; label: string }>; value?: V; onChange: (v: V) => void; label?: string }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{
              minHeight: TOUCH_TARGET,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.surface,
              justifyContent: 'center',
            }}
          >
            <Text variant="label" style={{ color: selected ? colors.primary : colors.text }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 0–10 scale selector with colour-graded tiles and anchor labels. */
export function ScaleSelector({ min = 0, max = 10, value, onChange, lowLabel, highLabel, label }: { min?: number; max?: number; value?: number; onChange: (v: number) => void; lowLabel?: string; highLabel?: string; label: string }) {
  const { colors, radius, spacing } = useTheme();
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const tone = (v: number) => {
    const t = (v - min) / (max - min || 1);
    return t < 0.4 ? colors.success : t < 0.7 ? colors.warning : colors.danger;
  };
  return (
    <View>
      <View accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {values.map((v) => {
          const selected = v === value;
          return (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={`${v}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(v)}
              style={{
                width: 44,
                height: TOUCH_TARGET,
                borderRadius: radius.md,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? tone(v) : colors.border,
                backgroundColor: selected ? tone(v) : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="label" style={{ color: selected ? '#FFFFFF' : colors.text }}>
                {v}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {lowLabel || highLabel ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs }}>
          <Text variant="caption" tone="secondary">
            {lowLabel}
          </Text>
          <Text variant="caption" tone="secondary">
            {highLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function YesNo({ value, onChange, label, yes = 'Yes', no = 'No' }: { value?: boolean; onChange: (v: boolean) => void; label: string; yes?: string; no?: string }) {
  return (
    <ChoiceChips
      label={label}
      options={[
        { value: 'yes', label: yes },
        { value: 'no', label: no },
      ]}
      value={value === undefined ? undefined : value ? 'yes' : 'no'}
      onChange={(v) => onChange(v === 'yes')}
    />
  );
}
