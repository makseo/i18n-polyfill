import {I18n} from '@makseo/i18n-polyfill';

export function Testing(i18nService: I18n): string {
  return i18nService({value: 'Hello World', id: 'Global1'});
}
