import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsIeltsBand(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIeltsBand',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be between 0 and 9 in 0.5 increments`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments): boolean {
          if (typeof value !== 'number' || Number.isNaN(value)) {
            return false;
          }
          if (value < 0 || value > 9) {
            return false;
          }
          return Math.abs((value * 2) - Math.round(value * 2)) < 1e-9;
        },
      },
    });
  };
}

