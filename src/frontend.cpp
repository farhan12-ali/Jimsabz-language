#include "jimsabz.hpp"
#include "sindhi_numbers.hpp"
#include <cctype>
#include <limits>

namespace jim {
std::string Fault::describe() const {
    auto out=at.file + ":" + std::to_string(at.line) + ":" + std::to_string(at.col) + " [" + code + "] " + what();
    for(auto &f:trace)out+="\n  at "+f.first+" ("+f.second.file+":"+std::to_string(f.second.line)+")";return out;
}
N node(std::string kind, const Token &t, std::string text) {
    auto n = std::make_shared<Node>();
    n->kind = std::move(kind);
    n->text = std::move(text);
    n->at = t.at;
    return n;
}
std::vector<Token> lex(const std::string &source, const std::string &file) {
    const std::unordered_map<std::string, std::string> aliases = {
        {"barabar", "=="}, {"na_barabar", "!="},   {"wado", ">"},
        {"nandho", "<"},   {"wado_barabar", ">="}, {"nandho_barabar", "<="},
        {"ain", "&&"},     {"ya", "||"},           {"naheen", "!"},
        {"جي", "jey"},     {"ڪردار", "kirdar"},    {"ها", "ha"},
        {"نه", "na"},      {"عدد", "adad"},        {"لفظ", "lafz"},
        {"ڪم", "kam"},     {"واپس", "wapas"},      {"ٻڌاءِ", "budhai"},
        {"ٻڌ", "budh"}};
    std::vector<Token> out;
    size_t p = 0;
    int line = 1, col = 1;
    auto peek = [&](size_t d = 0) -> char { return p + d < source.size() ? source[p + d] : '\0'; };
    auto step = [&]() {
        char c = source[p++];
        if (c == '\n') {
            line++;
            col = 1;
        } else if ((static_cast<unsigned char>(c) & 0xc0) != 0x80)
            col++;
        return c;
    };
    auto emit = [&](TK k, std::string text, Span at) { out.push_back({k, std::move(text), std::move(at)}); };
    if (source.size() >= 3 && source.substr(0, 3) == "\xef\xbb\xbf")
        p = 3;
    while (p < source.size()) {
        Span at{file, line, col};
        char c = peek();
        if (c == ' ' || c == '\t' || c == '\r') {
            step();
            continue;
        }
        if (c == '\n') {
            step();
            emit(TK::Newline, "\n", at);
            continue;
        }
        if (c == '/' && peek(1) == '/') {
            while (p < source.size() && peek() != '\n')
                step();
            continue;
        }
        if (c == '/' && peek(1) == '*') {
            step();
            step();
            bool closed = false;
            while (p < source.size()) {
                if (peek() == '*' && peek(1) == '/') {
                    step();
                    step();
                    closed = true;
                    break;
                }
                Span here{file, line, col};
                if (step() == '\n')
                    emit(TK::Newline, "\n", here);
            }
            if (!closed)
                throw Fault("LEX-01", 0, at, "Unclosed block comment. Add '*/'.");
            continue;
        }
        if (c == '"') {
            step();
            std::string value;
            bool closed = false;
            while (p < source.size()) {
                char s = step();
                if (s == '"') {
                    closed = true;
                    break;
                }
                if (s == '\n')
                    throw Fault("LEX-01", 0, at, "String crosses a line. Use '\\n' inside the string.");
                if (s == '\\') {
                    if (p == source.size())
                        break;
                    char e = step();
                    switch (e) {
                    case 'n':
                        value += '\n';
                        break;
                    case 't':
                        value += '\t';
                        break;
                    case 'r':
                        value += '\r';
                        break;
                    case '"':
                        value += '"';
                        break;
                    case '\\':
                        value += '\\';
                        break;
                    default:
                        throw Fault("LEX-02", 0, at, "Unknown string escape.");
                    }
                } else
                    value += s;
            }
            if (!closed)
                throw Fault("LEX-01", 0, at, "Unterminated string. Add a closing quote.");
            emit(TK::String, value, at);
            continue;
        }
        if (std::isdigit(static_cast<unsigned char>(c)) ||
            (c == '.' && std::isdigit(static_cast<unsigned char>(peek(1))))) {
            std::string value;
            bool decimal = false;
            while (std::isdigit(static_cast<unsigned char>(peek())))
                value += step();
            if (peek() == '.' && peek(1) != '.') {
                decimal = true;
                value += step();
                while (std::isdigit(static_cast<unsigned char>(peek())))
                    value += step();
            }
            if (peek() == 'e' || peek() == 'E') {
                decimal = true;
                value += step();
                if (peek() == '+' || peek() == '-')
                    value += step();
                if (!std::isdigit(static_cast<unsigned char>(peek())))
                    throw Fault("LEX-02", 0, at, "Expected digits after exponent.");
                while (std::isdigit(static_cast<unsigned char>(peek())))
                    value += step();
            }
            try {
                size_t end = 0;
                if (decimal) {
                    double x = std::stod(value, &end);
                    if (!std::isfinite(x))
                        throw std::out_of_range("number");
                } else
                    std::stoll(value, &end);
            } catch (...) {
                throw Fault("LEX-02", 0, at, "Number is outside the supported 64-bit range.");
            }
            emit(decimal ? TK::Decimal : TK::Integer, value, at);
            continue;
        }
        if (std::isalpha(static_cast<unsigned char>(c)) || c == '_' || static_cast<unsigned char>(c) >= 128) {
            std::string word;
            while (std::isalnum(static_cast<unsigned char>(peek())) || peek() == '_' ||
                   static_cast<unsigned char>(peek()) >= 128)
                word += step();
            auto a = aliases.find(word);
            if (a != aliases.end())
                word = a->second;
            if (word.rfind("adad_", 0) == 0) {
                int number = sindhiNumber(word.substr(5));
                if (number < 0) throw Fault("LEX-02", 0, at, "Unknown Sindhi number word. Use adad_satt, adad_hik_sau_satt, adad_hazar, or ordinary digits.");
                emit(TK::Integer, std::to_string(number), at);
                continue;
            }
            bool symbolic = word == "==" || word == "!=" || word == ">" || word == "<" || word == ">=" ||
                            word == "<=" || word == "&&" || word == "||" || word == "!";
            emit(symbolic ? TK::Symbol : TK::Word, word, at);
            continue;
        }
        if (c == '#') {
            std::string hex;
            hex += step();
            while (std::isxdigit(static_cast<unsigned char>(peek())))
                hex += step();
            if (hex.size() != 7 && hex.size() != 9)
                throw Fault("LEX-02", 0, at, "Use #RRGGBB or #AARRGGBB for a color.");
            emit(TK::String, hex, at);
            continue;
        }
        if(c=='@'&&!std::isalpha(static_cast<unsigned char>(peek(1)))&&peek(1)!='_'&&static_cast<unsigned char>(peek(1))<128)throw Fault("LEX-02",0,at,"An attribute needs a name immediately after @.");
        std::string two;
        two += c;
        two += peek(1);
        if(source.substr(p,3)=="...") { step();step();step();emit(TK::Symbol,"...",at);continue; }
        const std::set<std::string> pairs = {
            "==", "!=", ">=", "<=", "+=", "-=", "*=", "/=", "%=", "++", "--", "&&", "||", "->", "..", "=>", "::", "??", "?."};
        if (pairs.count(two)) {
            step();
            step();
            emit(TK::Symbol, two, at);
            continue;
        }
        if (std::string("{}()[],:;.+-*/%!=<>@?").find(c) != std::string::npos) {
            step();
            emit(TK::Symbol, std::string(1, c), at);
            continue;
        }
        throw Fault("LEX-02", 0, at,
                    c == '&' ? "Unexpected '&'. Use '&&' or 'ain'."
                             : "Unexpected character '" + std::string(1, c) + "'.");
    }
    emit(TK::End, "", {file, line, col});
    return out;
}

class Parser {
    const std::vector<Token> &t;
    size_t p = 0, anonymous = 0;
    std::set<std::string> types = {"adad", "dec", "lafz", "isharo", "qatar", "khazano", "Map", "Set", "Task", "Collections", "Core"};
    const Token &cur(size_t n = 0) const { return t[std::min(p + n, t.size() - 1)]; }
    bool is(const std::string &s) const { return cur().kind != TK::String && cur().text == s; }
    bool match(const std::string &s) {
        if (is(s)) {
            p++;
            return true;
        }
        return false;
    }
    Token take() { return t[p++]; }
    Token need(const std::string &s) {
        if (!is(s))
            throw Fault("SYN-02", 1, cur().at,
                        "Expected '" + s + "', found '" +
                            (cur().kind == TK::End ? "end of file" : cur().text) + "'.");
        return take();
    }
    Token word() {
        if (cur().kind != TK::Word)
            throw Fault("SYN-01", 1, cur().at, "Expected a name.");
        return take();
    }
    void lines() {
        while (cur().kind == TK::Newline)
            p++;
    }
    void finish() {
        if (cur().kind == TK::Newline) {
            lines();
            return;
        }
        if (cur().kind == TK::End || is("}"))
            return;
        throw Fault("SYN-01", 1, cur().at,
                    is(";") ? "Statements end with a newline. Semicolons belong only in gin loop headers."
                            : "Expected a newline after this statement.");
    }
    std::string type() {
        auto s = word().text;
        if(s=="kam") {
            need("(");s="kam(";bool first=true;
            if(!is(")"))do {if(!first)s+=",";first=false;s+=type();}while(match(","));
            need(")");need("->");return s+")->"+type();
        }
        if (s == "qatar") {
            if (match("<")) {
                s += " " + type();
                need(">");
            } else
                s += " " + type();
        } else {
            while(match("."))s+="."+word().text;
            if(s=="Collections.Map"||s=="Collections.Set"||s=="Core.Task")s=s.substr(s.find('.')+1);
            if(match("<")) {
                s+="<";s+=type();while(match(","))s+=","+type();need(">");s+=">";
            }
        }
        if(match("?"))s+="?";
        return s;
    }
    bool declaration() const {
        if(cur().text=="kam")return cur(1).text=="(";
        if(cur().text=="badal" && cur(1).kind==TK::Word && cur(2).text=="=")return true;
        const std::set<std::string> statements = {
            "budha",  "budhai", "budh",   "jey",       "na_ta",  "wori",     "gin",    "rok",
            "agty",   "wapas",  "azmai",  "pakar",     "chundo", "halat",    "aam",    "khed",
            "khed3d", "manzar", "kirdar", "mujassamo", "roshni", "camera3d", "khirki", "pichaan",
            "dhun",   "wajai",  "awaz",   "har",       "takkar", "takkar3d", "on_key", "on_click",
            "naqsho", "dukaan", "shay",   "marhalo",   "kharna", "acha",     "kam",    "qism"};
        return types.count(cur().text) > 0 ||
               (cur().kind == TK::Word && cur(1).kind == TK::Word && !statements.count(cur().text));
    }
    N variable(bool noFinish = false) {
        Token begin = cur();
        bool fixed = match("pakko");
        auto ty = match("khazano") ? std::string("adad") : match("badal")?std::string("auto"):type();
        auto name = word();
        auto n = node("var", begin, name.text);
        n->type = ty;
        n->fixed = fixed;
        n->currency = begin.text == "khazano";
        if (match("="))
            n->children.push_back(expr());
        if (!noFinish)
            finish();
        return n;
    }
    N block() {
        Token b = need("{");
        auto n = node("block", b);
        lines();
        while (!is("}")) {
            if (cur().kind == TK::End)
                need("}");
            n->children.push_back(statement());
            lines();
        }
        need("}");
        return n;
    }
    void genericParams(const N &n) {
        if(!match("<"))return;
        do {
            auto name=word();
            if(std::find(n->generics.begin(),n->generics.end(),name.text)!=n->generics.end())throw Fault("SYN-01",1,name.at,"Duplicate type parameter.");
            n->generics.push_back(name.text);
            if(match(":"))n->constraints[name.text]=type();
        }while(match(","));
        need(">");
    }
    void parameters(const N &n) {
        need("(");
        if(!is(")"))do {
            if(n->variadic)throw Fault("SYN-01",1,cur().at,"Variadic parameter must be last.");
            auto ty=type();bool rest=match("...");auto name=word();
            n->params.push_back({ty,name.text});n->variadic=rest;
            n->defaults.push_back(match("=")?expr():N{});
            if(rest&&n->defaults.back())throw Fault("SYN-01",1,name.at,"A variadic parameter cannot have a default.");
        }while(match(","));
        need(")");
    }
    N function() {
        auto b = need("kam");
        auto n = node("function", b, word().text);
        genericParams(n);parameters(n);
        n->type = match("->") ? type() : "khali";
        bool signature=cur().kind==TK::Newline||is("}");
        lines();
        if(is("{"))n->children.push_back(block());
        else if(!signature)need("{");
        return n;
    }
    N ifstmt() {
        auto b = need("jey");
        auto n = node("if", b);
        need("(");
        n->children.push_back(expr());
        need(")");
        lines();
        n->children.push_back(block());
        lines();
        if (match("na_ta")) {
            lines();
            n->children.push_back(is("jey") ? ifstmt() : block());
        }
        return n;
    }
    N property() {
        auto b = word();
        auto n = node("property", b, b.text);
        match(":");
        if (b.text == "harkat") {
            n->children.push_back(atom());
            need(":");
            need("frames");
            need("(");
            n->children.push_back(expr(2));
            need("..");
            n->children.push_back(expr(2));
            need(",");
            need("fps");
            need(":");
            n->children.push_back(expr());
            need(")");
        } else if (b.text == "tasveer" && cur().kind == TK::String) {
            auto imageToken = take();
            n->children.push_back(node("string", imageToken, imageToken.text));
            if (match("(")) {
                need("size");
                need(":");
                n->children.push_back(expr());
                need(",");
                n->children.push_back(expr());
                need(")");
            }
        } else
            n->children.push_back(expr());
        finish();
        return n;
    }
    N entity(std::string k) {
        auto b = take();
        auto n = node(k, b, word().text);
        need("{");
        lines();
        while (!is("}")) {
            if (cur().kind == TK::End)
                need("}");
            n->children.push_back(property());
            lines();
        }
        need("}");
        return n;
    }
    N command(std::string k) {
        auto b = take();
        auto n = node(k, b, b.text);
        n->children.push_back(expr());
        if (k == "window") {
            need(",");
            n->children.push_back(expr());
        }
        finish();
        return n;
    }
    N statement() {
        lines();
        auto b = cur();
        if(is("@") && cur(1).text!="await") {
            std::set<std::string> attrs;
            while(match("@")) {auto name=word();attrs.insert(name.text);lines();}
            auto n=statement();n->attrs.insert(attrs.begin(),attrs.end());return n;
        }
        if (is("kharna") || is("acha")) {
            take();
            auto n = node("import", b, take().text);
            finish();
            return n;
        }
        if (is("qism")) {
            take();
            auto n = node("class", b, word().text);
            genericParams(n);
            if(match(":")){do {n->bases.push_back(type());}while(match(","));}
            lines();
            need("{");
            lines();
            while (!is("}")) {
                if (cur().kind == TK::End)
                    need("}");
                n->children.push_back(statement());
                lines();
            }
            need("}");
            return n;
        }
        if (is("kam") && cur(1).text!="(")
            return function();
        if (is("pakko") || declaration())
            return variable();
        if (is("budhai") || is("budha")) {
            take();
            match("="); // Beginner-friendly output: budhai = "Farhan"
            auto n = node("print", b);
            n->children.push_back(expr());
            finish();
            return n;
        }
        if (is("jey"))
            return ifstmt();
        if (is("wori")) {
            take();
            auto n = node("while", b);
            need("(");
            n->children.push_back(expr());
            need(")");
            lines();
            n->children.push_back(block());
            return n;
        }
        if (is("gin")) {
            take();
            if (match("(")) {
                auto n = node("for", b);
                n->children.push_back(is(";") ? node("int",cur(),"0") : declaration() ? variable(true) : expr());
                need(";");
                n->children.push_back(is(";") ? node("bool",cur(),"ha") : expr());
                need(";");
                n->children.push_back(is(")") ? node("int",cur(),"0") : expr());
                need(")");
                lines();
                n->children.push_back(block());
                return n;
            }
            auto n = node("foreach", b, word().text);
            need("andar");
            n->children.push_back(expr());
            lines();
            n->children.push_back(block());
            return n;
        }
        if (is("rok") || is("agty")) {
            take();
            auto n = node(b.text == "rok" ? "break" : "continue", b);
            finish();
            return n;
        }
        if (is("wapas")) {
            take();
            auto n = node("return", b);
            if (cur().kind != TK::Newline && cur().kind != TK::End && !is("}"))
                n->children.push_back(expr());
            finish();
            return n;
        }
        if (is("azmai")) {
            take();
            auto n = node("try", b);
            lines();
            n->children.push_back(block());
            lines();
            need("pakar");
            need("(");
            n->text = word().text;
            need(")");
            lines();
            n->children.push_back(block());
            return n;
        }
        if (is("chundo")) {
            take();
            auto n = node("switch", b);
            need("(");
            n->children.push_back(expr());
            need(")");
            need("{");
            lines();
            while (!is("}")) {
                auto c = take();
                if (c.text != "halat" && c.text != "aam")
                    throw Fault("SYN-01", 1, c.at, "Expected 'halat' or 'aam' in chundo.");
                auto arm = node(c.text == "aam" ? "default" : "case", c);
                if (c.text == "halat")
                    arm->children.push_back(expr());
                need(":");
                lines();
                auto body = node("block", c);
                while (!is("halat") && !is("aam") && !is("}")) {
                    if (cur().kind == TK::End)
                        need("}");
                    body->children.push_back(statement());
                    lines();
                }
                arm->children.push_back(body);
                n->children.push_back(arm);
            }
            need("}");
            return n;
        }
        if (is("khed") || is("khed3d")) {
            take();
            auto title = take();
            if (title.kind != TK::String)
                throw Fault("SYN-01", 1, title.at, "Game title must be a quoted string.");
            auto n = node("game", b, title.text);
            n->type = b.text == "khed3d" ? "3" : "2";
            lines();
            n->children.push_back(block());
            return n;
        }
        if (is("manzar")) {
            take();
            auto n = node("scene", b, word().text);
            lines();
            n->children.push_back(block());
            return n;
        }
        if (is("kirdar") || is("mujassamo"))
            return entity(is("kirdar") ? "actor" : "mesh");
        if (is("roshni") || is("camera3d")) {
            take();
            auto n = node("config", b, b.text);
            need("{");
            lines();
            while (!is("}")) {
                if (cur().kind == TK::End)
                    need("}");
                n->children.push_back(property());
                lines();
            }
            need("}");
            return n;
        }
        if (is("khirki"))
            return command("window");
        if (is("pichaan"))
            return command("background");
        if (is("dhun") || is("wajai") || is("awaz"))
            return command("audio");
        if (is("har")) {
            take();
            auto n = node("timer", b);
            n->children.push_back(expr());
            need("second");
            lines();
            n->children.push_back(block());
            return n;
        }
        if (is("takkar") || is("takkar3d") || is("on_key") || is("on_click")) {
            take();
            auto n = node("event", b, b.text);
            need("(");
            if (!is(")")) {
                do {
                    n->children.push_back(expr());
                } while (match(","));
            }
            need(")");
            lines();
            n->children.push_back(block());
            return n;
        }
        if (is("naqsho")) {
            take();
            auto n = node("tilemap", b, word().text);
            need("=");
            n->children.push_back(expr());
            finish();
            return n;
        }
        if (is("dukaan")) {
            take();
            auto n = node("shop", b);
            need("(");
            need("key");
            need(":");
            n->children.push_back(expr());
            need(")");
            need("{");
            lines();
            while (!is("}")) {
                auto s = need("shay");
                auto item = node("item", s);
                item->children.push_back(atom());
                need("qeemat");
                item->children.push_back(expr());
                need("->");
                item->children.push_back(statement());
                n->children.push_back(item);
                lines();
            }
            need("}");
            return n;
        }
        if (is("marhalo")) {
            take();
            auto n = node("level", b);
            n->children.push_back(expr());
            if (cur().kind == TK::String)
                n->text = take().text;
            lines();
            n->children.push_back(block());
            return n;
        }
        if (is("{"))
            return block();
        auto n = node("expression", b);
        n->children.push_back(expr());
        finish();
        return n;
    }
    int prec(const std::string &s) const {
        if (s == "=" || s == "+=" || s == "-=" || s == "*=" || s == "/=" || s == "%=") return 1;
        if (s == "??") return 2;
        if (s == "||") return 3;
        if (s == "&&") return 4;
        if (s == "==" || s == "!=") return 5;
        if (s == ">" || s == "<" || s == ">=" || s == "<=") return 6;
        if (s == "+" || s == "-") return 7;
        if (s == "*" || s == "/" || s == "%") return 8;
        return 0;
    }
    N expr(int minimum = 1) {
        auto left = unary();
        while (cur().kind == TK::Symbol) {
            int k = prec(cur().text);
            if (k < minimum || k == 0)
                break;
            auto op = take();
            auto right = expr(k + (k == 1 || op.text == "??" ? 0 : 1));
            auto n = node(k == 1 ? "assign" : "binary", op, op.text);
            n->children = {left, right};
            left = n;
        }
        return left;
    }
    N unary() {
        if(is("@")) {auto b=take();need("await");auto n=node("await",b);n->children.push_back(unary());return n;}
        if (is("++") || is("--")) {
            auto b=take();auto out=node("increment",b,"pre"+b.text);
            out->children.push_back(unary());return out;
        }
        if (is("!") || is("-") || is("+")) {
            auto b = take();
            auto n = node("unary", b, b.text);
            n->children.push_back(unary());
            return n;
        }
        auto n = atom();
        while (true) {
            if(match("::")) {
                need("<");do {n->typeArgs.push_back(type());}while(match(","));need(">");
            } else if (match(".")) {
                auto b = word();
                auto m = node("member", b, b.text);
                m->children = {n};
                n = m;
            } else if (match("[")) {
                auto m = node("index", cur());
                m->children = {n, expr()};
                need("]");
                n = m;
            } else if (match("(")) {
                auto m = node("call", cur(), n->text);
                m->children.push_back(n);
                lines();
                if (!is(")")) {
                    do {
                        lines();
                        if(match("...")) {auto a=node("spread",cur());a->children.push_back(expr());m->children.push_back(a);}
                        else if (cur().kind == TK::Word && cur(1).text == ":") {
                            auto b = take();
                            take();
                            auto a = node("named", b, b.text);
                            a->children.push_back(expr());
                            m->children.push_back(a);
                        } else
                            m->children.push_back(expr());
                        lines();
                    } while (match(","));
                }
                need(")");
                n = m;
            } else if (is("++") || is("--")) {
                auto b=take();auto out=node("increment",b,"post"+b.text);
                out->children.push_back(n);n=out;
            } else
                break;
        }
        return n;
    }
    N atom() {
        auto b = take();
        if(b.text=="kam") {
            auto n=node("lambda",b,"$lambda"+std::to_string(anonymous++));parameters(n);need("->");n->type=type();
            if(match("=>")) {auto body=node("block",b),ret=node("return",b);ret->children.push_back(expr());body->children.push_back(ret);n->children.push_back(body);}
            else {lines();n->children.push_back(block());}
            return n;
        }
        if (b.kind == TK::Integer)
            return node("int", b, b.text);
        if (b.kind == TK::Decimal)
            return node("dec", b, b.text);
        if (b.kind == TK::String)
            return node("string", b, b.text);
        if (b.text == "ha" || b.text == "na")
            return node("bool", b, b.text);
        if (b.text == "khali")
            return node("null", b);
        if (b.text == "naon") {
            auto n = node("new", b, type());
            need("(");
            if (!is(")")) {
                do {
                    n->children.push_back(expr());
                } while (match(","));
            }
            need(")");
            return n;
        }
        if (b.text == "(") {
            lines();
            auto first = expr();
            if (match(",")) {
                auto n = node("vector", b);
                n->children.push_back(first);
                do {
                    lines();
                    n->children.push_back(expr());
                } while (match(","));
                need(")");
                if (n->children.size() < 2 || n->children.size() > 3)
                    throw Fault("SYN-01", 1, b.at, "Vectors contain two or three components.");
                return n;
            }
            need(")");
            return first;
        }
        if (b.text == "[") {
            auto n = node("array", b);
            lines();
            if (!is("]")) {
                do {
                    lines();
                    n->children.push_back(expr());
                    lines();
                } while (match(","));
            }
            need("]");
            return n;
        }
        if (b.kind == TK::Word)
            return node("name", b, b.text);
        throw Fault("SYN-01", 1, b.at,
                    "Expected a value, found '" + (b.kind == TK::End ? "end of file" : b.text) + "'.");
    }

  public:
    explicit Parser(const std::vector<Token> &tokens) : t(tokens) {
        for (size_t i = 0; i + 1 < t.size(); i++)
            if (t[i].text == "qism")
                types.insert(t[i + 1].text);
    }
    N run() {
        auto n = node("program", cur());
        lines();
        while (cur().kind != TK::End) {
            n->children.push_back(statement());
            lines();
        }
        return n;
    }
};
N parse(const std::vector<Token> &tokens) { return Parser(tokens).run(); }
std::string astText(const N &n, int indent) {
    std::string s(indent, ' ');
    s += n->kind;
    if (!n->text.empty())
        s += " " + n->text;
    if (!n->type.empty())
        s += " : " + n->type;
    s += " @" + std::to_string(n->at.line) + "\n";
    for (auto &c : n->children)
        s += astText(c, indent + 2);
    return s;
}
size_t nodeCount(const N &n) {
    size_t c = 1;
    for (auto &a : n->children)
        c += nodeCount(a);
    return c;
}
} // namespace jim
