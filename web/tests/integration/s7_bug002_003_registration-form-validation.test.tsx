import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationField } from '../../components/registration/RegistrationField';
import { RegistrationFormValidationError, validateRegistrationAnswers } from '../../lib/validation/registrationForm';

const fields = [
  { id: 'radio', fieldName: 'Attendance', fieldType: 'radio', isRequired: true, options: ['Morning', 'Afternoon'] },
  { id: 'checkbox', fieldName: 'Interests', fieldType: 'checkbox', isRequired: true, options: ['Web', 'Mobile'] },
  { id: 'select', fieldName: 'City', fieldType: 'select', isRequired: true, options: ['Jakarta', 'Bandung'] },
  { id: 'number', fieldName: 'Guests', fieldType: 'number', isRequired: false, options: null },
];

describe('BUG-002/003 registration form contract validation', () => {
  it('renders the concrete choice control for every persisted choice type', () => {
    const radio = renderToStaticMarkup(<RegistrationField field={fields[0]} />);
    const checkbox = renderToStaticMarkup(<RegistrationField field={fields[1]} />);
    const select = renderToStaticMarkup(<RegistrationField field={fields[2]} />);

    expect(radio).toContain('type="radio"');
    expect(checkbox).toContain('type="checkbox"');
    expect(select).toContain('<select');
    expect(select).toContain('value="Jakarta"');
  });

  it('accepts the canonical radio, checkbox, and select answer shapes', () => {
    expect(() => validateRegistrationAnswers(fields, {
      field_radio: 'Morning',
      field_checkbox: ['Web', 'Mobile'],
      field_select: 'Jakarta',
      field_number: '2',
    })).not.toThrow();
  });

  it('rejects client-side required bypasses, invalid options, and unknown fields', () => {
    expect(() => validateRegistrationAnswers(fields, {
      field_radio: 'Morning',
      field_checkbox: [],
      field_select: 'Jakarta',
    })).toThrow(RegistrationFormValidationError);
    expect(() => validateRegistrationAnswers(fields, {
      field_radio: 'Morning',
      field_checkbox: ['Web'],
      field_select: 'Surabaya',
    })).toThrow('Pilihan tidak valid');
    expect(() => validateRegistrationAnswers(fields, {
      field_radio: 'Morning',
      field_checkbox: ['Web'],
      field_select: 'Jakarta',
      field_untrusted: 'injected',
    })).toThrow('Field pendaftaran tidak dikenal');
  });
});
