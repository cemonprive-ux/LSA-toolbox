/* LSA Toolbox : outil encadré sans second écran.
   La page parente affiche l'outil (iframe) à sa hauteur réelle : un seul défilement, celui de la page.
   Même origine requise (GitHub Pages) ; sinon la hauteur de repli définie en CSS s'applique. */
(function(){
var f=document.querySelector(".frame-wrap iframe");
if(!f)return;
f.setAttribute("scrolling","no");
var CSS="html,body{height:auto!important;min-height:0!important;overflow:hidden!important}[style*='min-height: 100vh']{min-height:0!important}";
var last=0;
function fit(){
var d;
try{d=f.contentDocument}catch(e){return}
if(!d||!d.documentElement||!d.body)return;
if(!d.getElementById("lsa-fit")){
var s=d.createElement("style");s.id="lsa-fit";s.textContent=CSS;
(d.head||d.documentElement).appendChild(s);
}
var h=Math.ceil(d.documentElement.getBoundingClientRect().height);
if(h>80&&Math.abs(h-last)>1){last=h;f.style.height=h+"px"}
}
f.addEventListener("load",fit);
window.addEventListener("resize",fit);
setInterval(fit,300);
fit();
})();
