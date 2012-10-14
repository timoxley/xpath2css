// JavaScript function for converting simple XPath to CSS selector.
// Ported by Dither from [cssify](https://github.com/santiycr/cssify)
// Example: `xpath2css('//div[@id="girl"][2]/span[@class="body"]//a[contains(@class, "sexy")]//img[1]')`

var DEBUG = false

var sub_regexes = {
    "tag": "([a-zA-Z][a-zA-Z0-9]{0,10}|\\*)",
    "attribute": "[.a-zA-Z_:][-\\w:.]*(\\(\\))?)",
    "value": "\\s*[\\w/:][-/\\w\\s,:;.]*"
};

var validation_re =
    "(?P<node>"+
      "("+
        "^id\\([\"\\']?(?P<idvalue>%(value)s)[\"\\']?\\)"+// special case! `id(idValue)`
      "|"+
        "(?P<nav>//?(?:following-sibling::)?)(?P<tag>%(tag)s)" + //  `//div`
        "(\\[("+
          "(?P<matched>(?P<mattr>@?%(attribute)s=[\"\\'](?P<mvalue>%(value)s))[\"\\']"+ // `[@id="well"]` supported and `[text()="yes"]` is not
        "|"+
          "(?P<contained>contains\\((?P<cattr>@?%(attribute)s,\\s*[\"\\'](?P<cvalue>%(value)s)[\"\\']\\))"+// `[contains(@id, "bleh")]` supported and `[contains(text(), "some")]` is not 
        ")\\])?"+
        "(\\[\\s*(?P<nth>\\d|last\\(\\s*\\))\\s*\\])?"+
      ")"+
    ")";

for(var prop in sub_regexes)
    validation_re = validation_re.replace(new RegExp('%\\(' + prop + '\\)s', 'gi'), sub_regexes[prop]);
validation_re = validation_re.replace(/\?P<node>|\?P<idvalue>|\?P<nav>|\?P<tag>|\?P<matched>|\?P<mattr>|\?P<mvalue>|\?P<contained>|\?P<cattr>|\?P<cvalue>|\?P<nth>/gi, '');

function XPath2CSSException(message) {
    this.message = message;
    this.name = "[XPath2CSSException]";
}
XPath2CSSException.prototype = new Error()

var log = DEBUG && console.log.bind(console) || function(){};

function xpath2css(xpath) {
    var prog, match, result, nav, tag, attr, nth, nodes, css, node_css = '', csses = [], xindex = 0, position = 0;

    // preparse xpath:
    // `contains(concat(" ", @class, " "), " classname ")` => `@class=classname` => `.classname`
    xpath = xpath.replace(/contains\s*\(\s*concat\(["']\s+["']\s*,\s*@class\s*,\s*["']\s+["']\)\s*,\s*["']\s+([a-zA-Z0-9-_]+)\s+["']\)/gi, '@class="$1"');
    
    if (typeof xpath == 'undefined' || (
            xpath.replace(/[\s-_=]/g,'') === '' || 
            xpath.length !== xpath.replace(/[-_\w:.]+\(\)\s*=|=\s*[-_\w:.]+\(\)|\sor\s|\sand\s|\[(?:[^\/\]]+[\/\[]\/?.+)+\]|starts-with\(|\[.*last\(\)\s*[-\+<>=].+\]|number\(\)|not\(|count\(|text\(|first\(|normalize-space|[^\/]following-sibling|concat\(|descendant::|parent::|self::|child::|/gi,'').length)) {
        //`number()=` etc or `=normalize-space()` etc, also `a or b` or `a and b` (to fix?) or other unsupported keywords
        return new XPath2CSSException('Invalid or unsupported XPath: ' + xpath);
    }
    
    var xpatharr = xpath.split('|');
    while(xpatharr[xindex]) {
        prog = new RegExp(validation_re,'gi');
        css = [];
        log('working with xpath: ' + xpatharr[xindex]);
        while(nodes = prog.exec(xpatharr[xindex])) {
            if(!nodes && position === 0) {
                return new XPath2CSSException('Invalid or unsupported XPath: ' + xpath);
            }
    
            log('node found: ' + JSON.stringify(nodes));
            match = {
                node: nodes[5],
                idvalue: nodes[12] || nodes[3],
                nav: nodes[4],
                tag: nodes[5],
                matched: nodes[7],
                mattr: nodes[10] || nodes[14],
                mvalue: nodes[12] || nodes[16],
                contained: nodes[13],
                cattr: nodes[14],
                cvalue: nodes[16],
                nth: nodes[18]
            };
            log('broke node down to: ' + JSON.stringify(match));
    
            if(position != 0 && match['nav']) {
                if (~match['nav'].indexOf('following-sibling::')) nav = ' + ';
                else nav = (match['nav'] == '//') ? ' ' : ' > ';
            } else {
                nav = '';
            }
            tag = (match['tag'] === '*') ? '' : (match['tag'] || '');
    
            if(match['contained']) {
                if(match['cattr'].indexOf('@') === 0) {
                    attr = '[' + match['cattr'].replace(/^@/, '') + '*=' + match['cvalue'] + ']';
                } else { //if(match['cattr'] === 'text()')
                    return new XPath2CSSException('Invalid or unsupported XPath attribute: ' + match['cattr']);
                }
            } else if(match['matched']) {
                switch (match['mattr']){
                    case '@id':
                        attr = '#' + match['mvalue'].replace(/^\s+|\s+$/,'').replace(/\s/g, '#');
                        break;
                    case '@class':
                        attr = '.' + match['mvalue'].replace(/^\s+|\s+$/,'').replace(/\s/g, '.');
                        break;
                    case 'text()':
                    case '.':
                        return new XPath2CSSException('Invalid or unsupported XPath attribute: ' + match['mattr']);
                    default:
                        if (match['mattr'].indexOf('@') !== 0) {
                            return new XPath2CSSException('Invalid or unsupported XPath attribute: ' + match['mattr']);
                        }
                        if(match['mvalue'].indexOf(' ') !== -1) {
                            match['mvalue'] = '\"' + match['mvalue'].replace(/^\s+|\s+$/,'') + '\"';
                        }
                        attr = '[' + match['mattr'].replace('@', '') + '=' + match['mvalue'] + ']';
                        break;
                }
            } else if(match['idvalue'])
                attr = '#' + match['idvalue'].replace(/\s/, '#');
            else
                attr = '';
    
            if(match['nth']) {
                if (match['nth'].indexOf('last') === -1){
                    if (isNaN(parseInt(match['nth'], 10))) {
                        return new XPath2CSSException('Invalid or unsupported XPath attribute: ' + match['nth']);
                    }
                    nth = parseInt(match['nth'], 10) !== 1 ? ':nth-of-type(' + match['nth'] + ')' : ':first-of-type';
                } else {
                    nth = ':last-of-type';
                }
            } else {
                nth = '';
            }
            node_css = nav + tag + attr + nth;
    
            log('final node css: ' + node_css);
            css.push(node_css);
            position++;
        } //while(nodes
        
        result = css.join('');
        if (result === '') {
            return new XPath2CSSException('Invalid or unsupported XPath: ' + xpath);
        }
        csses.push(result);
        xindex++;

    } //while(xpatharr

    return csses.join(', ');
}

module.exports = function(xpath) {
  var css = null
  css = xpath2css(xpath);
  return css
}