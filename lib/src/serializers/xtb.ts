/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ml from '../ast/ast';
import * as i18n from '../ast/i18n_ast';
import {I18nError} from '../ast/parse_util';
import {Parser} from '../ast/parser';
import {getXmlTagDefinition} from '../ast/xml_tags';
import {I18nMessagesById} from './serializer';
import {digest} from './digest';
import {xmbMapper} from './xmb';

const _TRANSLATIONS_TAG = 'translationbundle';
const _TRANSLATION_TAG = 'translation';
const _PLACEHOLDER_TAG = 'ph';

export function xtbLoadToI18n(content: string): I18nMessagesById {
  // xtb to xml nodes
  const xtbParser = new XtbParser();
  const {msgIdToHtml, errors: parseErrors} = xtbParser.parse(content);

  if (parseErrors.length) {
    throw new Error(`xtb parse errors:\n${parseErrors.join('\n')}`);
  }

  // xml nodes to i18n nodes
  const i18nNodesByMsgId: {[msgId: string]: i18n.Node[]} = {};
  const converter = new XmlToI18n();

  // Because we should be able to load xtb files that rely on features not supported by angular,
  // we need to delay the conversion of html to i18n nodes so that non angular messages are not
  // converted
  Object.keys(msgIdToHtml).forEach((msgId) => {
    const valueFn = () => {
      const {i18nNodes, errors} = converter.convert(msgIdToHtml[msgId]);
      if (errors.length) {
        throw new Error(`xtb parse errors:\n${errors.join('\n')}`);
      }
      return i18nNodes;
    };
    createLazyProperty(i18nNodesByMsgId, msgId, valueFn);
  });

  return i18nNodesByMsgId;
}

export const xtbDigest = digest;

export const xtbMapper = xmbMapper;

function createLazyProperty(messages: any, id: string, valueFn: () => any) {
  Object.defineProperty(messages, id, {
    configurable: true,
    enumerable: true,
    get: () => {
      const value = valueFn();
      Object.defineProperty(messages, id, {enumerable: true, value});
      return value;
    },
    set: (_) => {
      throw new Error('Could not overwrite an XTB translation');
    },
  });
}

// Extract messages as xml nodes from the xtb file
class XtbParser implements ml.Visitor {
  private _bundleDepth: number;
  private _errors: I18nError[];
  private _msgIdToHtml: {[msgId: string]: string};

  parse(xtb: string) {
    this._bundleDepth = 0;
    this._msgIdToHtml = {};

    // We can not parse the ICU messages at this point as some messages might not originate
    // from Angular that could not be lex'd.
    const xml = new Parser(getXmlTagDefinition).parse(xtb, '', false);

    this._errors = xml.errors;
    ml.visitAll(this, xml.rootNodes);

    return {
      msgIdToHtml: this._msgIdToHtml,
      errors: this._errors,
    };
  }

  visitElement(element: ml.Element, context: any): any {
    switch (element.name) {
      case _TRANSLATIONS_TAG:
        this._bundleDepth++;
        if (this._bundleDepth > 1) {
          this._addError(element, `<${_TRANSLATIONS_TAG}> elements can not be nested`);
        }
        ml.visitAll(this, element.children, null);
        this._bundleDepth--;
        break;

      case _TRANSLATION_TAG:
        const idAttr = element.attrs.find((attr) => attr.name === 'id');
        if (!idAttr) {
          this._addError(element, `<${_TRANSLATION_TAG}> misses the "id" attribute`);
        } else {
          const id = idAttr.value;
          if (this._msgIdToHtml.hasOwnProperty(id)) {
            this._addError(element, `Duplicated translations for msg ${id}`);
          } else {
            const innerTextStart = element.startSourceSpan!.end.offset;
            const innerTextEnd = element.endSourceSpan!.start.offset;
            const content = element.startSourceSpan!.start.file.content;
            const innerText = content.slice(innerTextStart!, innerTextEnd!);
            this._msgIdToHtml[id] = innerText;
          }
        }
        break;

      default:
        this._addError(element, 'Unexpected tag');
    }
  }

  visitAttribute(attribute: ml.Attribute, context: any): any {}

  visitText(text: ml.Text, context: any): any {}

  visitComment(comment: ml.Comment, context: any): any {}

  visitExpansion(expansion: ml.Expansion, context: any): any {}

  visitExpansionCase(expansionCase: ml.ExpansionCase, context: any): any {}

  private _addError(node: ml.Node, message: string): void {
    this._errors.push(new I18nError(node.sourceSpan!, message));
  }
}

// Convert ml nodes (xtb syntax) to i18n nodes
class XmlToI18n implements ml.Visitor {
  private _errors: I18nError[];

  convert(message: string) {
    const xmlIcu = new Parser(getXmlTagDefinition).parse(message, '', true);
    this._errors = xmlIcu.errors;

    const i18nNodes =
      this._errors.length > 0 || xmlIcu.rootNodes.length === 0 ? [] : ml.visitAll(this, xmlIcu.rootNodes);

    return {
      i18nNodes,
      errors: this._errors,
    };
  }

  visitText(text: ml.Text, context: any) {
    return new i18n.Text(text.value, text.sourceSpan!);
  }

  visitExpansion(icu: ml.Expansion, context: any) {
    const caseMap: {[value: string]: i18n.Node} = {};

    ml.visitAll(this, icu.cases).forEach((c) => {
      caseMap[c.value] = new i18n.Container(c.nodes, icu.sourceSpan);
    });

    return new i18n.Icu(icu.switchValue, icu.type, caseMap, icu.sourceSpan);
  }

  visitExpansionCase(icuCase: ml.ExpansionCase, context: any): any {
    return {
      value: icuCase.value,
      nodes: ml.visitAll(this, icuCase.expression),
    };
  }

  visitElement(el: ml.Element, context: any): i18n.Placeholder | null {
    if (el.name === _PLACEHOLDER_TAG) {
      const nameAttr = el.attrs.find((attr) => attr.name === 'name');
      if (nameAttr) {
        return new i18n.Placeholder('', nameAttr.value, el.sourceSpan!);
      }

      this._addError(el, `<${_PLACEHOLDER_TAG}> misses the "name" attribute`);
    } else {
      this._addError(el, `Unexpected tag`);
    }
    return null;
  }

  visitComment(comment: ml.Comment, context: any) {}

  visitAttribute(attribute: ml.Attribute, context: any) {}

  private _addError(node: ml.Node, message: string): void {
    this._errors.push(new I18nError(node.sourceSpan!, message));
  }
}
