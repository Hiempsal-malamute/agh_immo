/* ####################################################################################
#                                                                                     #
#                                INITIALISATION DOM                                   #
#                                                                                     #
##################################################################################### */

// liste déroulante choix du type d'annonce 
const liste_type_annonce = document.getElementById("input-transaction");

// pour le tri alphanumérique
const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});


// dimensions des graphiques en pixel (possibilité de donner d'autres dimensions si souhaité)
// à déclarer en constantes pour ne pas risquer de les écraser plus tard dans le code
const width = 450,
      height = 220,
      margin = {left:35, top:0, right:60, bottom:40};

// initialisation carrés chiffres clés
// let nb_annonces = new dc.NumberDisplay("#total")
let nb_annonces_selection = new dc.NumberDisplay("#total-filtre")
let nb_prixm2_selection = new dc.NumberDisplay("#prix-m2-filtre")

// initialisation des graphiques par type de graphique
let prix_m2_barchart = new dc.RowChart("#prix-m2-ville");
let surface_chart = new dc.BarChart("#nb-annonces-surface");
let annonces_mois_barchart = new dc.BarChart("#nb-annonce-temps");
let dpe_barchart = new dc.BarChart("#nb-annonce-dpe");


/* ####################################################################################
#                                                                                     #
#                            INITIALISATION DU TOOLTIP                                #
#                                                                                     #
##################################################################################### */

// Configuration du tooltip : création d'une div vide qui va accueillir du texte 
// et s'afficher au mouseover
const tooltip = d3.select("body")
    .append("div")
    .attr("class","tooltip")
    .style("display", "none");

// Mousemove tooltip
function mousemove() {
    tooltip.style("display","block")
       .style("left", (d3.event.pageX - 75) + "px")
       .style("top", (d3.event.pageY - 100) + "px")
  };


// changer le style au mouseover 
function hoverOn(el) {
    // fait apparaitre une bordure rouge autour de l'élément survolé
    el.style("stroke","red")
        .style("stroke-width",2)
        .style("opacity",1);
} 

function hoverOut(el) {
    // remet le style par défaut
    el.style("stroke","none")
        .style("opacity",.9);

    // vide le contenu de la tooltip puis cache la    
    tooltip.html("")
        .style("display","none");
}

/* ####################################################################################
#                                                                                     #
#                            INITIALISATION DU TOOLTIP                                #
#                                                                                     #
##################################################################################### */

let immo_group = d3.json("./data/immo_group.json");
let immo_group_etendu = d3.json("./data/ref_geographique_etendu.json");

let promises = [];

promises.push(immo_group);
promises.push(immo_group_etendu);

/* ####################################################################################
#                                                                                     #
#                               PROGRAMME PRINCIPAL                                   #
#                                                                                     #
##################################################################################### */


// chargement fichiers et corps principal du site   
Promise.all(promises).then(json => {
    let immo_group = json[1];
    // let immo_group = data;
    immo_group.forEach(e => {
        e.surface = Math.floor(e.surface/15)*15
    });

    // filtrage des données
    liste_type_annonce.addEventListener("change",e => {
        Array.from(document.getElementsByClassName("card")).forEach(card => {
            if (card.style.display == "none") {
                card.style.display = "block"
            }
        })
        // récupère la value choisie dans la liste déroulante
        type_annonce = e.target.value;

        // filtrage sur le choix du type de transaction
        immo_group_filtered = immo_group.filter(d => d.typedetransaction == type_annonce);

        // filtrage sur les annonces de moins de 150 m² de surface
        immo_group_filtered = immo_group_filtered.filter(e => {
            return e.surface <= 150
        });

        // immo_group_filtered.forEach(e => discretizeSurface(e))
        console.log(immo_group_filtered);
        

        nombres = document.getElementsByClassName("nombre");
            
        Array.from(nombres).forEach(nombre => {
            nombre.style.display = "block"
        })


        reloadAll()
        
        // fin du programme : rendu final et actualisation de tous les graphiques 
        dc.renderAll()


        /* ####################################################################################
        #                                                                                     #
        #                 PREPARATION DES DONNEES : crossfilter + reductio                    #
        #                                                                                     #
        ##################################################################################### */
        
        function reloadAll() {
            // création de l'instance crossfilter
            let annonces = crossfilter(immo_group_filtered);
            
            // dimension globale
            let allDim = annonces.dimension(d => { return d});
            let prixm2Dim = annonces.dimension(d => { return d["prix_m²"]});

            // dimensions par champ            
            ville_dim = annonces.dimension(d => { return d.ville});
            surface_dim = annonces.dimension(d => { return d.surface});
            // surface_dim = annonces.dimension(d => { return multikey(Math.floor(d.surface),d.nb_pieces)});
            // pour les mois, conversion obligatoire en date : https://stackoverflow.com/questions/32518542/how-to-set-up-dc-js-x-axis-for-dates 
            mois_dim = annonces.dimension(d => { return new Date(d.date)}) ;
            nbpieces_dim = annonces.dimension(d => { return d.nb_pieces});
            dpe_dim = annonces.dimension(d => { return d.dpeL});
            
            // tableaux agrégés
            let total_annonces = allDim.groupAll();
            let total_prixm2 = prixm2Dim.groupAll();
            
            villes_group = ville_dim.group();
            nbpieces_group = nbpieces_dim.group();
            // opération mathématique pour obtenir des barres agrégées sur l'histogramme 
            // surface_group = surface_dim.group().reduce(
            //     (p,v) => {
            //         p[v.nb_pieces] = (p[v.nb_pieces] || 0) + 1;                    
            //         return p;},
            //     (p,v) => {
            //         p[v.nb_pieces] = (p[v.nb_pieces] || 0) + 1;
            //         return p;},
            //     () => { return {}}
            //     );
            surface_group = surface_dim.group(d => { return Math.floor(d/15)*15 });
            // surface_group = surface_dim.group().reduceSum(d => { return (d.surface/15)*15})
            console.log(surface_group.all());
            
            mois_group = mois_dim.group();
            dpe_group = dpe_dim.group();
            
            // création des annonces groupées par nb de pièces : utilisation de la librairie reductio 
            // voir => https://stackoverflow.com/questions/40307099/d3-dc-js-how-to-create-a-stacked-bar-chart-while-telling-crossfilter-to-treat 
            let addValueGroup = (reducer, key) => {
                reducer.value(key)
                    .filter(d => { return d.nb_pieces.indexOf(key) !== -1})
                    .count(true)
            };

            let reducer_nbpieces = reductio().count(true);

            nbpieces_group.all().forEach(e => {
                addValueGroup(reducer_nbpieces,e.key)
            });
 
            // calcul des nombres de pièces pour les données sur le nb d'annocnes par surface et le nb d'annonces par mois
            // surface_group = stack_second(surface_group);
            reducer_nbpieces(surface_group);
            reducer_nbpieces(mois_group)
            
            // calcul de la médiane à l'aide de Reductio
            reductio().median(d => { return +d["prix_m²"]})(villes_group)
            reductio().median(d => { return +d["prix_m²"]})(total_prixm2)

            
            
            /* ####################################################################################
            #                                                                                     #
            #                       GENERATION DES GRAPHIQUES : D3js + DCjs                       #
            #                                                                                     #
            ##################################################################################### */


            // chiffre clé 1 m: nombre d'annonces dans le type de transactions choisi
            document.getElementById("nb-annonces-total").innerHTML = immo_group_filtered.length;
            
            nb_annonces_selection
                .formatNumber(d3.format("d"))
                .valueAccessor(d => {return d})
                .group(total_annonces)
                .on("renderlet",chart => {
                    chart.selectAll("span").style("color","#018571")
                });
                
                
            nb_prixm2_selection
                .formatNumber(d3.format("$.1f"))
                .valueAccessor(d => {return d.median})
                .group(total_prixm2)
                .on("renderlet",chart => {
                    chart.selectAll("span").style("color","#993404")
                    document.getElementsByTagName("span").innerHTML = " €/m²";
                });

                

            // graphique 1 
            prix_m2_barchart.width(width).height(550)
                // .margins(margin)
                // chargement des données 1) dimension 2) groupe de données
                .dimension(ville_dim)
                .group(villes_group)
                .x(d3.scaleLinear().domain([0, d3.max(villes_group.all(), d => { return d.value.median})]))
                // renseigner si l'intervalle des données doit changer visuellement sur l'axe x ou y 
                .elasticX(true)
                // valeurs à renseigner quand elle est calculée par reductio notamment 
                .keyAccessor(d => {return d.key})
                .valueAccessor(d => {return d.value.median})
                .label(p => {return p.key})
                // les transitions ... MACHA ALLAH.
                .transitionDuration(500)
                // intéraction avec le reste des graphiques
                .on('pretransition', chart => {
                    chart.selectAll('rect')
                        .on("click", function(d) { // !!! ne jamais utiliser les fonctions fléchées => pr appeler this, ça ne marche pas !!!                  
                            chart.filter(d.key).redrawGroup();
                        }).on("mouseover", function(d) {
                            d3.select(this)
                              .call(hoverOn);
                            
                            tooltip.html("Ville : " + d.key + "<br>" +
                                        "Prix médian au m² : " + d.value.median + " €");

                        }).on("mouseout", function(d)  {
                            d3.select(this)
                              .call(hoverOut);
                        }).on("mousemove",mousemove)
                });
            
            // surface_chart
            //     .width(width).height(height).margins(margin)
            //     .dimension(surface_dim)
            //     .group(surface_group,"1 pièce",sel_stack(1))
            //     .x(d3.scaleBand())
            //     .xUnits(dc.units.ordinal)
            //     .brushOn(false)
            //     .on("renderlet.barclicker", chart => {
            //         chart.selectAll('rect.bar')
            //         .style("fill", function(d) {
            //             return getColorNbPieces(d.layer)
            //         })
            //         .on("mouseover", function(d) {
            //             // configure le style au mouseover
            //             d3.select(this).call(hoverOn);
            //             // configuration texte tooltip
            //             tooltip.html("Surface : " + d.x + " m² <br> Nombre d'annonces : " + d.y +
            //                         "<br>Nombre de pièces : " + d.layer);
            //         })
            //         .on("mouseout", function(d) {
            //             d3.select(this).call(hoverOut)
            //         }).on("mousemove",mousemove)
            //         .on("click", d => {
            //             chart.filter(d.data.key).redrawGroup();
            //         })
            //     })

            // for (let i = 2; i < 7; i++) {
            //     surface_chart.stack(surface_group,i + " pièces",sel_stack(i))
            // }
            
            // graphique 2 : nb d'annonces par surface
            surface_chart
                .width(width).height(height)
                .margins(margin)
                .dimension(surface_dim)
                // .group(surface_group)
                // ajout des barres empilées
                .group(surface_group, "1 pièce",sel_stack(1))
                    .stack(surface_group, "2 pièces",sel_stack(2))
                    .stack(surface_group, "3 pièces",sel_stack(3))
                    .stack(surface_group, "4 pièces",sel_stack(4))
                    .stack(surface_group, "5 pièces",sel_stack(5))
                    .stack(surface_group, "6 pièces",sel_stack(6))
                    .stack(surface_group, "7 pièces",sel_stack(7))
                // configuration de l'axe x
                .x(d3.scaleLinear())
                .xUnits(() => { return 11}) // espacement entre les barres.
                // .x(d3.scaleBand().domain(surface_group.all().map(d => {  return d.key;})))
                // .xUnits(dc.units.ordinal)
                .valueAccessor(d => { return d.value.count})
                .elasticY(true)
                .elasticX(true)
                .transitionDuration(500)
                .renderHorizontalGridLines(true)
                .brushOn(false)
                // ajout de la légende (facultatif)
                .legend(dc.legend()
                          .x(margin.left-35)
                          .y(height-15)
                          .itemWidth(60)
                          .horizontal(true)
                          .highlightSelected(true))
                .on('renderlet', chart => {
                    // interaction
                    chart.selectAll('rect.bar').on("click", function(d) {
                        chart.filter(d.data.key).redrawGroup();
                        d3.selectAll("rect.bar.deselected").style("fill","gray")
                    });
                    chart.selectAll(".dc-lenged-item g").style("fill", d => getColorNbPieces)
                    
                    // configuration couleurs et tooltip
                    chart.selectAll('rect.bar').style("fill", function(d) {
                        return getColorNbPieces(d.layer)
                    })
                    .on("mouseover", function(d) {
                        // configure le style au mouseover
                        d3.select(this).call(hoverOn);
                        // configuration texte tooltip
                        tooltip.html("Surface : " + d.x + " m² <br> Nombre d'annonces : " + d.y +
                                    "<br>Nombre de pièces : " + d.layer);
                    }).classed('deselected', false)
                    .on("mouseout", function(d) {
                        d3.select(this).call(hoverOut)
                    }).on("mousemove",mousemove);

                })
                .xAxis().tickValues([15,30,45,60,75,90,105,120,135,150])


            let minDate = d3.min(mois_group.all(), d => {return d.key}),
                maxDate = d3.max(mois_group.all(),d => { return d.key});

            // graphique 3 : nb d'annonces par mois
            annonces_mois_barchart.width(width*2).height(height)                
                .margins(margin)
                .dimension(mois_dim)
                .group(mois_group)
                .group(mois_group, "1 pièce",sel_stack(1))
                // ajout des barres empilées
                    .stack(mois_group, "2 pièces",sel_stack(2))
                    .stack(mois_group, "3 pièces",sel_stack(3))
                    .stack(mois_group, "4 pièces",sel_stack(4))
                    .stack(mois_group, "5 pièces",sel_stack(5))
                    .stack(mois_group, "6 pièces",sel_stack(6))
                .transitionDuration(500)
                .valueAccessor(d => { return d.value.count})
                .keyAccessor(d => { return d.key})
                .x(d3.scaleBand().domain(d3.map(mois_group.all().map(d => { return d.key }))))
                .x(d3.scaleTime())
                // .x(d3.scaleTime().domain([
                //     minDate,
                //     d3.timeMonth.offset(maxDate,1)]))
                // .round(d3.timeMonth.round)
                // .xUnits(d3.timeMonth)
                .xUnits(() => { return 12})
                .gap(5)
                .elasticX(true)
                .elasticY(true)
                .xAxisPadding(15)
                .outerPadding(30)
                .barPadding(0.2)
                .centerBar(true)     
                .renderHorizontalGridLines(true)
                // .xAxisLabel("Mois")
                .mouseZoomable(false)
                .controlsUseVisibility(true)
                .on("renderlet", chart => {
                    chart.selectAll(".bar").style("fill", function(d) {
                        return getColorNbPieces(d.layer)
                    });
                    chart.selectAll("g.x text")
                        .attr("transform", "translate(-15,15)rotate(-45)")
                });

                
            // graphique 4 : nb d'annonces par DPE                
            dpe_barchart.width(width).height(height)
                .margins(margin)
                .dimension(dpe_dim)
                .group(dpe_group)   
                .valueAccessor(d => { return d.value})
                // .x(d3.scaleBand().domain(["A","B","C","D","E","F","G"]))
                .x(d3.scaleBand().domain(dpe_group.all().map(d => { return d.key })))
                .xUnits(dc.units.ordinal)
                .ordinalColors((["gray","#319733", "#32cb33", "#ccfd2f", "#ffff00", "#fdcc00", "#ff9a32", "#fb0101"]))
                .colorAccessor(d => {return d.key})
                .renderHorizontalGridLines(true)
                .elasticY(true)
                .brushOn(false)
                .barPadding(0.2)
                // .xAxisLabel("DPE par catégorie")
                // configuration des couleurs
                .transitionDuration(500)
                .on('renderlet', chart => {
                    chart.selectAll('rect').on("click", function(d) {
                        console.log("click!", d)
                        chart.filter(d.data.key).redrawGroup();
                    }).on("mouseover", function(d) {
                        d3.select(this)
                          .call(hoverOn)
                        
                        tooltip.html("Nombre d'annonces de catégorie " +d.x + " : " + d.y)
                    }).on("mouseout", function(d) {
                        d3.select(this).call(hoverOut)
                    }).on("mousemove",mousemove)

                })
                // toujours donner le nombre de marqueurs séparément du reste 
                .yAxis().ticks(5)
                }

    });
});

// fonction qui va servir à l'empilement des barres
function sel_stack(i) {
    return function(d) {
        return d.value[i] ? d.value[i].count : -1;
    };
};

function multikey(x,y) {
    return x + 'x' + y;
}
function splitkey(k) {   
    return k.split('x');
}

function stack_second(group) {
    return {
        all: function() {
            var all = group.all(),
                m = {};
            // build matrix from multikey/value pairs
            all.forEach(function(kv) {
                var ks = splitkey(kv.key);
                m[ks[0]] = m[ks[0]] || {};
                m[ks[0]][ks[1]] = kv.value;
            });
            // then produce multivalue key/value pairs
            return Object.keys(m).map(function(k) {
                return {key: k, value: m[k]};
            });
        }
    };
}


function getColorNbPieces(nb_pieces) {
    palette = ["#d4b9da","#c994c7","#df65b0","#e7298a","#ce1256","#91003f"];
    // let color "#f1eef6";
    switch (nb_pieces) {
        case "1 pièce": 
            return palette[0];
            break;
        case "2 pièces": 
            return palette[1];
            break;
        case "3 pièces": 
            return palette[2];
            break;
        case "4 pièces": 
            return palette[3];
            break;
        case "5 pièces": 
            return palette[4];
            break;
        case "6 pièces": 
            return palette[5];
            break;
        case "7 pièces": 
            return palette[6];
            break;
    };
};

function discretizeSurface(e) {
    surface = e.surface;
    if (surface < 15) {
        e.surface = "0-15"
    } else if (surface >= 15 & surface < 30) {
        e.surface = "15-30"
    } else if (surface >= 30 & surface < 45){
        e.surface = "30-45"
    } else if (surface >= 45 & surface < 60){
        e.surface = "45-60"
    } else if (surface >= 60 & surface < 75){
        e.surface = "60-75"
    } else if (surface >= 75 & surface < 90){
        e.surface = "75-90"
    } else if (surface >= 90 & surface < 105){
        e.surface = "90-105"
    } else if (surface >= 105 & surface < 120){
        e.surface = "105-120"
    } else if (surface >= 120 & surface < 135){
        e.surface = "120-135"
    } else if (surface >= 135 & surface < 150){
        e.surface = "135-150"
    } else if (surface >= 150){
        e.surface = "Plus de 150"
    }
}

// pour rendre les graphiques responsifs au chargement de la page (ne fonctionne pas avec DC js)
function responsivefy(svg) {
  // http://bl.ocks.org/d3noob/6a3b59149cf3ebdb3fc4
  let container = d3.select(svg.node().parentNode),
      width = parseInt(svg.style('width')),
      height = parseInt(svg.style('height')),
      aspect = width / height;
  
  svg.attr('viewBox', '0 0 ' + width + " " + height )
      .attr('preserveAspectRatio', 'xMinYMid')
      .call(resize);
  
  d3.select(window).on('resize.' + container.attr('id'), resize);
  d3.select(window).on('load.' + container.attr('id'), resize);
  
  function resize() {
      const w = parseInt(container.style('width'));
      svg.attr('width', w);
      svg.attr('height', Math.round(w / aspect));
  }
}