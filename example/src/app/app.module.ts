import {BrowserModule} from '@angular/platform-browser';
import {LOCALE_ID, NgModule, TRANSLATIONS, TRANSLATIONS_FORMAT} from '@angular/core';
import {I18n} from '@makseo/i18n-polyfill';
import {AppComponent} from './app.component';

const xlf = require('raw-loader!../i18n/messages.fr.xlf');

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule],
  providers: [
    {provide: TRANSLATIONS_FORMAT, useValue: 'xlf'},
    {provide: TRANSLATIONS, useValue: xlf},
    {provide: LOCALE_ID, useValue: 'fr'},
    I18n,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
