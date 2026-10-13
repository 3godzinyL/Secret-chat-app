// UMBRA native cryptography — minimal Node-API boundary, C++20 + OpenSSL.
// Native addon never logs plaintext, keys, or authentication tags.
#include <node_api.h>
#include <openssl/evp.h>
#include <openssl/crypto.h>
#include <cstdint>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <vector>

namespace {
struct Sensitive {
    std::vector<unsigned char> data;
    ~Sensitive(){ if(!data.empty()) OPENSSL_cleanse(data.data(), data.size()); }
};
void check(napi_env e,napi_status status){if(status!=napi_ok)throw std::runtime_error("N-API failure");}
std::vector<unsigned char> bytes(napi_env e,napi_value v,size_t exact=0){
    bool is=false;check(e,napi_is_buffer(e,v,&is));
    if(!is)throw std::runtime_error("Expected Node Buffer");
    void* data=nullptr;size_t n=0;check(e,napi_get_buffer_info(e,v,&data,&n));
    if(exact && n!=exact)throw std::runtime_error("Invalid key/IV length");
    if(n>20*1024*1024)throw std::runtime_error("Payload too large");
    return std::vector<unsigned char>((unsigned char*)data,(unsigned char*)data+n);
}
napi_value crypt(napi_env env,napi_callback_info info,bool decrypt){
    Sensitive key,iv,input;Sensitive output;
    try{
        size_t argc=3;napi_value argv[3];check(env,napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr));
        if(argc!=3)throw std::runtime_error("Expected (key[32], iv[12], input)");
        key.data=bytes(env,argv[0],32);iv.data=bytes(env,argv[1],12);input.data=bytes(env,argv[2]);
        if(decrypt && input.data.size()<16)throw std::runtime_error("Bad ciphertext");
        using Context=std::unique_ptr<EVP_CIPHER_CTX,decltype(&EVP_CIPHER_CTX_free)>;
        Context ctx(EVP_CIPHER_CTX_new(),EVP_CIPHER_CTX_free);
        if(!ctx)throw std::runtime_error("EVP allocation error");
        output.data.resize(input.data.size()+16);
        int len=0,last=0;
        if(decrypt){
            size_t n=input.data.size()-16;
            if(EVP_DecryptInit_ex(ctx.get(),EVP_aes_256_gcm(),nullptr,nullptr,nullptr)!=1 ||
               EVP_CIPHER_CTX_ctrl(ctx.get(),EVP_CTRL_GCM_SET_IVLEN,12,nullptr)!=1 ||
               EVP_DecryptInit_ex(ctx.get(),nullptr,nullptr,key.data.data(),iv.data.data())!=1 ||
               EVP_DecryptUpdate(ctx.get(),output.data.data(),&len,input.data.data(),static_cast<int>(n))!=1 ||
               EVP_CIPHER_CTX_ctrl(ctx.get(),EVP_CTRL_GCM_SET_TAG,16,input.data.data()+n)!=1 ||
               EVP_DecryptFinal_ex(ctx.get(),output.data.data()+len,&last)!=1)
                throw std::runtime_error("Authentication failed");
            output.data.resize(len+last);
        }else{
            if(EVP_EncryptInit_ex(ctx.get(),EVP_aes_256_gcm(),nullptr,nullptr,nullptr)!=1 ||
               EVP_CIPHER_CTX_ctrl(ctx.get(),EVP_CTRL_GCM_SET_IVLEN,12,nullptr)!=1 ||
               EVP_EncryptInit_ex(ctx.get(),nullptr,nullptr,key.data.data(),iv.data.data())!=1 ||
               EVP_EncryptUpdate(ctx.get(),output.data.data(),&len,input.data.data(),static_cast<int>(input.data.size()))!=1 ||
               EVP_EncryptFinal_ex(ctx.get(),output.data.data()+len,&last)!=1 ||
               EVP_CIPHER_CTX_ctrl(ctx.get(),EVP_CTRL_GCM_GET_TAG,16,output.data.data()+len+last)!=1)
                throw std::runtime_error("Encryption failed");
            output.data.resize(len+last+16);
        }
        napi_value buf;check(env,napi_create_buffer_copy(env,output.data.size(),output.data.data(),nullptr,&buf));return buf;
    }catch(const std::exception& ex){napi_throw_error(env,"UMBRA_CRYPTO",ex.what());return nullptr;}
}
napi_value seal(napi_env env,napi_callback_info info){return crypt(env,info,false);}
napi_value unseal(napi_env env,napi_callback_info info){return crypt(env,info,true);}
napi_value init(napi_env env,napi_value exports){
    napi_property_descriptor props[]={
      {"seal",nullptr,seal,nullptr,nullptr,nullptr,napi_default,nullptr},
      {"unseal",nullptr,unseal,nullptr,nullptr,nullptr,napi_default,nullptr}
    };
    check(env,napi_define_properties(env,exports,2,props));return exports;
}
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
