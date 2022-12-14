/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as i18n from '../ast/i18n_ast';
import * as ml from '../ast/ast';
import * as xml from './xml_helper';
import {decimalDigest} from './digest';
import {HtmlToXmlParser, PlaceholderMapper, SimplePlaceholderMapper, XmlMessagesById} from './serializer';

const _MESSAGES_TAG = 'messagebundle';
const _MESSAGE_TAG = 'msg';
const _PLACEHOLDER_TAG = 'ph';
const _EXEMPLE_TAG = 'ex';
const _SOURCE_TAG = 'source';

const _DOCTYPE = `<!ELEMENT messagebundle (msg)*>
<!ATTLIST messagebundle class CDATA #IMPLIED>

<!ELEMENT msg (#PCDATA|ph|source)*>
<!ATTLIST msg id CDATA #IMPLIED>
<!ATTLIST msg seq CDATA #IMPLIED>
<!ATTLIST msg name CDATA #IMPLIED>
<!ATTLIST msg desc CDATA #IMPLIED>
<!ATTLIST msg meaning CDATA #IMPLIED>
<!ATTLIST msg obsolete (obsolete) #IMPLIED>
<!ATTLIST msg xml:space (default|preserve) "default">
<!ATTLIST msg is_hidden CDATA #IMPLIED>

<!ELEMENT source (#PCDATA)>

<!ELEMENT ph (#PCDATA|ex)*>
<!ATTLIST ph name CDATA #REQUIRED>

<!ELEMENT ex (#PCDATA)>`;

// used to merge translations when extracting
export function xmbLoadToXml(content: string): XmlMessagesById {
  const parser = new HtmlToXmlParser(_MESSAGE_TAG);
  const {xmlMessagesById, errors} = parser.parse(content);

  if (errors.length) {
    throw new Error(`xmb parse errors:\n${errors.join('\n')}`);
  }

  return xmlMessagesById;
}

export function xmbWrite(messages: i18n.Message[], locale: string | null, existingNodes: xml.Node[] = []): string {
  const exampleVisitor = new ExampleVisitor();
  const visitor = new Visitor();
  const rootNode = new xml.Tag(_MESSAGES_TAG);

  existingNodes.forEach((node) => {
    rootNode.children.push(new xml.CR(2), node);
  });

  // console.log(existingNodes);
  messages.forEach((message) => {
    const attrs: {[k: string]: string} = {id: message.id};

    if (message.description) {
      attrs['desc'] = message.description;
    }

    if (message.meaning) {
      attrs['meaning'] = message.meaning;
    }

    const sourceTags: xml.Tag[] = [];
    message.sources.forEach((source: i18n.MessageSpan) => {
      sourceTags.push(
        new xml.Tag(_SOURCE_TAG, {}, [
          new xml.Text(
            `${source.filePath}:${source.startLine}${source.endLine !== source.startLine ? ',' + source.endLine : ''}`,
          ),
        ]),
      );
    });

    rootNode.children.push(
      new xml.CR(2),
      new xml.Tag(_MESSAGE_TAG, attrs, [...sourceTags, ...visitor.serialize(message.nodes)]),
    );
  });

  rootNode.children.push(new xml.CR());

  return xml.serialize([
    new xml.Declaration({version: '1.0', encoding: 'UTF-8'}),
    new xml.CR(),
    new xml.Doctype(_MESSAGES_TAG, _DOCTYPE),
    new xml.CR(),
    exampleVisitor.addDefaultExamples(rootNode),
    new xml.CR(),
  ]);
}

export function xmbDigest(message: i18n.Message): string {
  return digest(message);
}

export function xmbMapper(message: i18n.Message): PlaceholderMapper {
  return new SimplePlaceholderMapper(message, toPublicName);
}

class Visitor implements i18n.Visitor {
  visitText(text: i18n.Text, context?: any): xml.Node[] {
    return [new xml.Text(text.value)];
  }

  visitContainer(container: i18n.Container, context: any): xml.Node[] {
    const nodes: xml.Node[] = [];
    container.children.forEach((node: i18n.Node) => nodes.push(...node.visit(this)));
    return nodes;
  }

  visitIcu(icu: i18n.Icu, context?: any): xml.Node[] {
    const nodes = [new xml.Text(`{${icu.expressionPlaceholder}, ${icu.type}, `)];

    Object.keys(icu.cases).forEach((c: string) => {
      nodes.push(new xml.Text(`${c} {`), ...icu.cases[c].visit(this), new xml.Text(`} `));
    });

    nodes.push(new xml.Text(`}`));

    return nodes;
  }

  visitTagPlaceholder(ph: i18n.TagPlaceholder, context?: any): xml.Node[] {
    const startEx = new xml.Tag(_EXEMPLE_TAG, {}, [new xml.Text(`<${ph.tag}>`)]);
    const startTagPh = new xml.Tag(_PLACEHOLDER_TAG, {name: ph.startName}, [startEx]);
    if (ph.isVoid) {
      // void tags have no children nor closing tags
      return [startTagPh];
    }

    const closeEx = new xml.Tag(_EXEMPLE_TAG, {}, [new xml.Text(`</${ph.tag}>`)]);
    const closeTagPh = new xml.Tag(_PLACEHOLDER_TAG, {name: ph.closeName}, [closeEx]);

    return [startTagPh, ...this.serialize(ph.children), closeTagPh];
  }

  visitPlaceholder(ph: i18n.Placeholder, context?: any): xml.Node[] {
    const exTag = new xml.Tag(_EXEMPLE_TAG, {}, [new xml.Text(`{{${ph.value}}}`)]);
    return [new xml.Tag(_PLACEHOLDER_TAG, {name: ph.name}, [exTag])];
  }

  visitIcuPlaceholder(ph: i18n.IcuPlaceholder, context?: any): xml.Node[] {
    const exTag = new xml.Tag(_EXEMPLE_TAG, {}, [
      new xml.Text(
        `{${ph.value.expression}, ${ph.value.type}, ${Object.keys(ph.value.cases)
          .map((value: string) => value + ' {...}')
          .join(' ')}}`,
      ),
    ]);
    return [new xml.Tag(_PLACEHOLDER_TAG, {name: ph.name}, [exTag])];
  }

  serialize(nodes: i18n.Node[]): xml.Node[] {
    return [].concat(...nodes.map((node) => node.visit(this)));
  }
}

export function digest(message: i18n.Message): string {
  return decimalDigest(message);
}

// TC requires at least one non-empty example on placeholders
class ExampleVisitor implements xml.IVisitor {
  addDefaultExamples(node: xml.Node): xml.Node {
    node.visit(this);
    return node;
  }

  visitTag(tag: xml.Tag): void {
    if (tag.name === _PLACEHOLDER_TAG) {
      if (!tag.children || tag.children.length === 0) {
        const exText = new xml.Text(tag.attrs['name'] || '...');
        tag.children = [new xml.Tag(_EXEMPLE_TAG, {}, [exText])];
      }
    } else if (tag.children) {
      tag.children.forEach((node) => node.visit(this));
    }
  }

  visitElement(element: ml.Element): any {
    const attrs = {};
    element.attrs.forEach((attr: ml.Attribute) => {
      attrs[attr.name] = attr.value;
    });
    const tag = new xml.Tag(element.name, attrs, element.children as any);
    return this.visitTag(tag);
  }

  visitText(text: xml.Text): void {}

  visitDeclaration(decl: xml.Declaration): void {}

  visitDoctype(doctype: xml.Doctype): void {}
}

// XMB/XTB placeholders can only contain A-Z, 0-9 and _
export function toPublicName(internalName: string): string {
  return internalName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}
