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
const width = 550,
      height = 350,
      margin = {left:50, top:20, right:40, bottom:50};

// initialisation des graphiques par type de graphique
let prix_m2_barchart = dc.rowChart("#prix-m2-ville");
let surface_chart = dc.barChart("#nb-annonces-surface");
let annonces_mois_barchart = dc.barChart("#nb-annonce-temps");
let dpe_barchart = dc.barChart("#nb-annonce-dpe");


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
       .style("left", (d3.event.pageX - 50) + "px")
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
        .style("opacity",.75);

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
    console.log(immo_group);
    
    // filtrage des données
    liste_type_annonce.addEventListener("change",e => {
        // récupère la value choisie dans la liste déroulante
        type_annonce = e.target.value;

        // filtrage sur le choix du type de transaction
        immo_group_filtered = immo_group.filter(d => d.typedetransaction == type_annonce);

        // filtrage sur les annonces de moins de 150 m² de surface
        immo_group_filtered = immo_group_filtered.filter(e => {
            return e.surface <= 150
        });

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
            
            // dimensions par champ
            
            ville_dim = annonces.dimension(d => { return d.ville});
            surface_dim = annonces.dimension(d => { return d.surface});
            // pour les mois, conversion obligatoire en date : https://stackoverflow.com/questions/32518542/how-to-set-up-dc-js-x-axis-for-dates 
            mois_dim = annonces.dimension(d => { return new Date(d.date)}) ;
            nbpieces_dim = annonces.dimension(d => { return d.nb_pieces});
            dpe_dim = annonces.dimension(d => { return d.dpeL});
            
            // tableaux agrégés
            villes_group = ville_dim.group();
            nbpieces_group = nbpieces_dim.group();
            // opération mathématique pour obtenir des barres agrégées sur l'histogramme 
            surface_group = surface_dim.group(d => { return Math.floor(d/17)*17 });
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
            reducer_nbpieces(surface_group)
            reducer_nbpieces(mois_group)
            
            // calcul de la médiane à l'aide de Reductio
            reductio().median(d => { return +d["prix_m²"]})(villes_group)
            
            /* ####################################################################################
            #                                                                                     #
            #                       GENERATION DES GRAPHIQUES : D3js + DCjs                       #
            #                                                                                     #
            ##################################################################################### */

            // graphique 1 
            prix_m2_barchart.width(width).height(height)
                .margins(margin)
                // chargement des données 1) dimension 2) groupe de données
                .dimension(ville_dim)
                .group(villes_group)
                .x(d3.scaleLinear().domain([0, d3.max(villes_group.all(), d => { return d.value.median})]))
                // renseigner si l'intervalle des données doit changer visuellement sur l'axe x ou y 
                .elasticX(true)
                // valeurs à renseigner quand elle est calculée par reductio notamment 
                .valueAccessor(d => {return d.value.median})
                .keyAccessor(d => {return d.key[0]})
                .label(p => {return p.key})
                // les transitions ... MACHA ALLAH.
                .transitionDuration(500)
                // intéraction avec le reste des graphiques
                .on('renderlet', chart => {
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

            // graphique 2 : nb d'annonces par surface
            surface_chart.width(width).height(height)
                .margins(margin)
                .dimension(surface_dim)
                .group(surface_group,1,sel_stack(1))
                // ajout des barres empilées
                    .stack(surface_group, 2,sel_stack(2))
                    .stack(surface_group, 3,sel_stack(3))
                    .stack(surface_group, 4,sel_stack(4))
                    .stack(surface_group, 5,sel_stack(5))
                // configuration de l'axe x
                .x(d3.scaleLinear())
                .xUnits(() => { return 9}) // nombre de barres à afficher
                .elasticY(true)
                .elasticX(true)
                .transitionDuration(500)
                .renderHorizontalGridLines(true)
                .brushOn(false)
                // ajout de la légende (facultatif)
                .legend(dc.legend())
                .on('renderlet', chart => {
                    chart.selectAll('rect').on("click", function(d) {    
                        chart.filter(d.data.key).redrawGroup();
                        console.log(d);
                    });
                    chart.selectAll('.bar')
                    .on("mouseover", function(d) {
                        // configure le style au mouseover
                        d3.select(this).call(hoverOn);

                        tooltip.html("Surface : " + d.x + " m² <br> Nombre d'annonces : " + d.y +
                                    "<br>Nombre de pièces : " + d.layer)
                    }).on("mouseout", function(d) {
                        d3.select(this).call(hoverOut)
                    }).on("mousemove",mousemove)
                });

            // graphique 3 : nb d'annonces par mois
            annonces_mois_barchart.width(width).height(height)                
                .margins(margin)
                .dimension(mois_dim)
                .group(mois_group, 1,sel_stack(1))
                    // ajout des barres empilées
                    .stack(mois_group, 2,sel_stack(2))
                    .stack(mois_group, 3,sel_stack(3))
                    .stack(mois_group, 4,sel_stack(4))
                    .stack(mois_group, 5,sel_stack(5))
                    .stack(mois_group, 6,sel_stack(6))
                .transitionDuration(500)
                .legend(dc.legend())
                .valueAccessor(d => { return d.value.count})
                .keyAccessor(d => {return d.key})
                .x(d3.scaleTime().domain([d3.min(mois_group.all(), d => {return d.key}),
                    d3.max(mois_group.all(),d => { return d.key})
                ]))
                .round(d3.timeMonth.round)
                .xUnits(d3.timeMonths)
                .elasticY(true)
                .renderHorizontalGridLines(true)
                .xAxisLabel("Mois")
                .mouseZoomable(true)

            // graphique 4 : nb d'annonces par DPE                
            dpe_barchart.width(width).height(height)
                .margins(margin)
                .dimension(dpe_dim)
                .group(dpe_group)
                .valueAccessor(d => { return d.value})
                .x(d3.scaleBand().domain(dpe_group.all().map(d => { return d.key })))
                .xUnits(dc.units.ordinal)
                .renderHorizontalGridLines(true)
                .elasticY(false)
                .xAxisLabel("Diagnostic de performance énergétique par catégorie")
                .yAxisLabel("Nombre d'annonces observées")
                // configuration des couleurs
                .colorAccessor(d => {return d.key})
                .ordinalColors((["grey","#319733", "#32cb33", "#ccfd2f", "#ffff00", "#fdcc00", "#ff9a32", "#fb0101"]))
                .legend(dc.legend())
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

                });

                // toujours donner le nombre de marqueurs séparément du reste 
                dpe_barchart.yAxis().ticks(5)

            }

    });
});

// fonction qui va servir à l'empilement des barres
function sel_stack(i) {
    return function(d) {
        return d.value[i] ? d.value[i].count : 0;
    };
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