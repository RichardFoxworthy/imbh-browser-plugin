/**
 * Declarative Transform System
 *
 * Replaces the `new Function('return ' + fn)()` eval pattern used in
 * content-script.ts with a safe, declarative transform specification.
 *
 * Transform specs are pure JSON — no executable code — so they can be
 * safely stored in the central adaptor service and distributed to all users.
 */

export type TransformSpec =
  | BooleanTransform
  | FormatTransform
  | MapTransform
  | DateTransform
  | ConcatTransform
  | AddressTransform;

interface BooleanTransform {
  type: 'boolean';
  trueValue: string;
  falseValue: string;
}

interface FormatTransform {
  type: 'format';
  template: string;  // e.g. "{unit}/{streetNumber} {streetName}"
}

interface MapTransform {
  type: 'map';
  mapping: Record<string, string>;  // e.g. { "house": "House", "apartment": "Flat" }
  fallback?: string;                // value if no match found
}

interface DateTransform {
  type: 'date';
  outputFormat: string;  // 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', etc.
}

interface ConcatTransform {
  type: 'concat';
  paths: string[];       // additional profile paths to concat
  separator: string;
}

interface AddressTransform {
  type: 'address';
  format: 'full' | 'street' | 'suburb-state-postcode';
}

/**
 * Apply a declarative transform to a raw value.
 */
export function applyTransform(
  value: any,
  spec: TransformSpec
): string {
  switch (spec.type) {
    case 'boolean':
      return value ? spec.trueValue : spec.falseValue;

    case 'format':
      return applyFormatTransform(value, spec.template);

    case 'map':
      return spec.mapping[String(value)] ?? spec.fallback ?? String(value);

    case 'date':
      return applyDateTransform(value, spec.outputFormat);

    case 'concat':
      // For concat, the engine must resolve additional paths and pass the array
      // Here we just join whatever array we're given
      if (Array.isArray(value)) {
        return value.filter(Boolean).join(spec.separator);
      }
      return String(value);

    case 'address':
      return applyAddressTransform(value, spec.format);

    default:
      return String(value);
  }
}

function applyFormatTransform(value: any, template: string): string {
  if (typeof value !== 'object' || value === null) {
    return String(value);
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = value[key];
    return v !== undefined && v !== null ? String(v) : '';
  });
}

function applyDateTransform(value: any, outputFormat: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());

  return outputFormat
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year)
    .replace('YY', year.slice(-2));
}

function applyAddressTransform(
  addr: any,
  format: 'full' | 'street' | 'suburb-state-postcode'
): string {
  if (typeof addr !== 'object' || addr === null) return String(addr);

  const unit = addr.unit ? `${addr.unit}/` : '';
  const street = `${unit}${addr.streetNumber || ''} ${addr.streetName || ''}`.trim();
  const location = `${addr.suburb || ''} ${addr.state || ''} ${addr.postcode || ''}`.trim();

  switch (format) {
    case 'street':
      return street;
    case 'suburb-state-postcode':
      return location;
    case 'full':
    default:
      return `${street}, ${location}`;
  }
}
