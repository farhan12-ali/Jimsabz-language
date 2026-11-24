#pragma once
#include <string>
#include <unordered_map>
#include <vector>
#include <algorithm>
#include <cctype>
#include <stdexcept>
namespace jim {
inline const std::vector<std::string>& sindhiSmall(){static const std::vector<std::string> words={"sifar","hik","ba","te","chaar","panj","chhah","satt","ath","nav","dah","yarahn","barahn","terahn","chaudahn","pandhran","sorahn","satrahn","arrahnh","unih","vih","ekih","bavih","tevih","chovih","panjvih","chhavih","satavih","athavih","untih","tih","ektih","batih","tetih","chotih","panjtih","chhatih","sattih","athtih","unitalih","chalih","ekitalih","baitalih","tetalih","choitalih","panjtalih","chhaitalih","sattetalih","athetalih","unvanjah","panjah","ekvanjah","bavanjah","tevanjah","chovanjah","panjvanjah","chhavanjah","satvanjah","athvanjah","unhath","sath","ekhath","bahath","tehath","chohath","panjhath","chhahath","sathath","athhath","unhatar","satar","ekhatar","bahatar","tehatar","chohatar","panjhatar","chhahatar","sathatar","athhatar","unasi","asi","ekasi","biasi","teasi","chorasi","panjasi","chhasi","satasi","athasi","unanve","nave","ekanve","bianve","teanve","choranve","panjanve","chhanve","satanve","athanve","navanve"};return words;}
inline std::string sindhiWord(int n){if(n<0||n>1000)throw std::runtime_error("Sindhi word conversion supports 0 through 1000; decimal numbers support the full adad range.");if(n==1000)return "hazar";if(n<100)return sindhiSmall()[n];return sindhiSmall()[n/100]+" sau"+(n%100?" "+sindhiSmall()[n%100]:"");}
inline std::string normalizeSindhi(std::string text){for(char &c:text){if(c=='_'||c=='-')c=' ';else c=char(std::tolower(static_cast<unsigned char>(c)));} std::string out;for(char c:text){if(std::isspace(static_cast<unsigned char>(c))){if(!out.empty()&&out.back()!=' ')out+=' ';}else out+=c;}if(!out.empty()&&out.back()==' ')out.pop_back();return out;}
inline int sindhiNumber(const std::string &text){static const auto values=[](){std::unordered_map<std::string,int> out;for(int n=0;n<=1000;n++)out[sindhiWord(n)]=n;out["hikro"]=1;out["hek"]=1;out["be"]=2;out["tre"]=3;out["char"]=4;out["panch"]=5;out["chheh"]=6;out["chhah"]=6;out["sat"]=7;out["atth"]=8;out["nau"]=9;out["dahh"]=10;out["veeh"]=20;out["teeh"]=30;out["chaleeh"]=40;out["panjaah"]=50;out["sattar"]=70;out["assi"]=80;out["naway"]=90;out["so"]=100;out["sau"]=100;out["hazaar"]=1000;out["hazar"]=1000;return out;}();auto it=values.find(normalizeSindhi(text));return it==values.end()?-1:it->second;}
}
