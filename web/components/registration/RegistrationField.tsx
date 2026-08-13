interface RegistrationFieldDefinition {
  id: string;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  options?: unknown;
}

export function RegistrationField({ field }: { field: RegistrationFieldDefinition }) {
  const fieldName = `field_${field.id}`;
  const options = Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === 'string') : [];

  return (
    <div className="flex flex-col gap-stack-sm pt-2">
      <label className="font-label-caps text-label-caps text-primary uppercase">
        {field.fieldName} {field.isRequired ? <span className="text-primary">*</span> : ''}
      </label>

      {field.fieldType === 'text' || field.fieldType === 'number' ? (
        <input type={field.fieldType} name={fieldName} required={field.isRequired} className="w-full h-[48px] px-4 bg-transparent border border-outline-variant rounded-DEFAULT font-body-md text-primary placeholder-on-surface-variant focus:outline-none input-border focus:border-primary" />
      ) : field.fieldType === 'textarea' ? (
        <textarea name={fieldName} required={field.isRequired} rows={3} className="w-full p-4 bg-transparent border border-outline-variant rounded-DEFAULT font-body-md text-primary placeholder-on-surface-variant focus:outline-none input-border focus:border-primary" />
      ) : field.fieldType === 'radio' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-sm">
          {options.map((option) => <label key={option} className="relative flex items-center p-4 border border-outline-variant rounded-lg cursor-pointer hover:bg-surface-bright transition-colors has-[:checked]:border-primary has-[:checked]:border-2 has-[:checked]:bg-surface-bright"><input type="radio" name={fieldName} value={option} required={field.isRequired} className="w-5 h-5 text-primary border-outline-variant focus:ring-primary focus:ring-offset-background" /><span className="ml-3 font-body-md text-primary">{option}</span></label>)}
        </div>
      ) : field.fieldType === 'checkbox' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-sm">
          {options.map((option, index) => <label key={option} className="relative flex items-center p-4 border border-outline-variant rounded-lg cursor-pointer hover:bg-surface-bright transition-colors has-[:checked]:border-primary has-[:checked]:border-2 has-[:checked]:bg-surface-bright"><input type="checkbox" name={fieldName} value={option} required={field.isRequired && index === 0} className="w-5 h-5 text-primary border-outline-variant rounded focus:ring-primary focus:ring-offset-background" /><span className="ml-3 font-body-md text-primary">{option}</span></label>)}
        </div>
      ) : field.fieldType === 'select' ? (
        <select name={fieldName} required={field.isRequired} defaultValue="" className="w-full h-[48px] px-4 bg-transparent border border-outline-variant rounded-DEFAULT font-body-md text-primary focus:outline-none input-border focus:border-primary">
          <option value="" disabled>Pilih {field.fieldName}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : field.fieldType === 'file' || field.fieldType === 'image' ? (
        <input type="file" name={fieldName} required={field.isRequired} accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="w-full px-4 py-3 border border-outline-variant rounded-DEFAULT font-body-md text-primary bg-surface-bright file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-surface-dim file:text-primary hover:file:bg-surface-container-high" />
      ) : (
        <input type="text" name={fieldName} required={field.isRequired} className="w-full h-[48px] px-4 bg-transparent border border-outline-variant rounded-DEFAULT font-body-md text-primary placeholder-on-surface-variant focus:outline-none input-border focus:border-primary" />
      )}
    </div>
  );
}
