import {getAst, getFileContent} from "../lib/extractor/src/extractor";

describe("Extractor", () => {
  it("should extract AST", () => {
    const messages = getAst(["example/src/**/*.ts"]);
    const url = "example/src/app/app.component.ts";
    expect(messages[url]).toBeDefined();
    expect(messages[url]).toEqual(["This is a test {{ok}} !", "another test ^_^"]);
  });

  it("should generate content", () => {
    const messages = getAst(["example/src/**/*.ts"]);
    const content = getFileContent(messages, "xlf");
    expect(content).toEqual(`<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" datatype="plaintext" original="ng2.template">
    <body>
      <trans-unit id="78e9f3aab47c6cf393131413e0c51dedaa37766b" datatype="html">
        <source>This is a test <x id="INTERPOLATION" equiv-text="{{ok}}"/> !</source>
        <context-group purpose="location">
          <context context-type="sourcefile">example/src/app/app.component.ts</context>
          <context context-type="linenumber">1</context>
        </context-group>
      </trans-unit>
      <trans-unit id="f9ec330a3324eff5b27f13b259df96618c503488" datatype="html">
        <source>another test ^_^</source>
        <context-group purpose="location">
          <context context-type="sourcefile">example/src/app/app.component.ts</context>
          <context context-type="linenumber">1</context>
        </context-group>
      </trans-unit>
    </body>
  </file>
</xliff>
`);
  });

  it("should merge content", () => {
    const messages = getAst(["example/src/**/*.ts"]);
    const content = getFileContent(messages, "example/src/i18n/source.xlf", "xlf");
    expect(content).toEqual(`<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" datatype="plaintext" original="ng2.template">
    <body>
      <trans-unit id="983775b9a51ce14b036be72d4cfd65d68d64e231" datatype="html">
        <source>translatable attribute</source>
      </trans-unit>
      <trans-unit id="78e9f3aab47c6cf393131413e0c51dedaa37766b" datatype="html">
        <source>This is a test <x id="INTERPOLATION" equiv-text="{{ok}}"/> !</source>
        <context-group purpose="location">
          <context context-type="sourcefile">example/src/app/app.component.ts</context>
          <context context-type="linenumber">1</context>
        </context-group>
      </trans-unit>
      <trans-unit id="f9ec330a3324eff5b27f13b259df96618c503488" datatype="html">
        <source>another test ^_^</source>
        <context-group purpose="location">
          <context context-type="sourcefile">example/src/app/app.component.ts</context>
          <context context-type="linenumber">1</context>
        </context-group>
      </trans-unit>
    </body>
  </file>
</xliff>
`);
  });
});